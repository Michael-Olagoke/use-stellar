/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../@lobstrco-signer-extension-api.d.ts" />

import type { StellarNetwork } from "../types"
import { getNetworkPassphrase } from "../types"
import type { WalletAdapter, WalletNetworkState, WalletNetworkDetails } from "./types"
import { WalletAdapterError } from "./types"
import { LOBSTR_WALLET_TYPE, resolveNetworkFromPassphrase } from "./constants"

/**
 * The subset of `@lobstrco/signer-extension-api` this adapter uses.
 *
 * This minimal interface allows us to mock the vendor SDK in tests without
 * importing the full API.
 */
interface LobstrApi {
  isConnected: () => Promise<boolean>
  getPublicKey: (options?: { network?: string }) => Promise<string>
  getConnectedWallet: (options?: { network?: string }) => Promise<{
    publicKey: string
    network: string
  } | null>
  getSupportedNetworks: () => Promise<
    Array<{
      network: string
      displayName: string
      nativeCode: string
      nativeDecimals: number
      explorerAccountUrl: string
      signTypes: string[]
      broadcaster: string
      available: boolean
    }>
  >
  supportsNetwork: (network: string) => Promise<boolean>
  signTransaction: (transaction: string, options?: { network?: string }) => Promise<string>
  NETWORK: {
    stellar?: string
    [key: string]: string | undefined
  }
}

let lobstrPromise: Promise<LobstrApi> | null = null
let lobstrResolved: LobstrApi | null = null

/**
 * Maps Stellar network names to LOBSTR signer extension SDK network identifiers.
 *
 * The LOBSTR signer extension uses "stellar" as the identifier for Stellar networks.
 * The actual network (mainnet vs testnet) is determined by the wallet's configuration.
 */
function toLobstrNetwork(): string {
  return "stellar"
}

/**
 * Gets the network passphrase for a given Stellar network.
 *
 * LOBSTR must be used with known networks only — we cannot guess or sign
 * against a custom passphrase.
 */
function requirePassphrase(network: StellarNetwork): string {
  const passphrase = getNetworkPassphrase(network)

  if (!passphrase) {
    throw new WalletAdapterError(
      "wallet_unsupported",
      `LOBSTR cannot be used with network="${network}" — it has no published passphrase. ` +
        "Use a wallet that reports its own network, or switch to testnet or mainnet."
    )
  }

  return passphrase
}

/**
 * Loads `@lobstrco/signer-extension-api` lazily and caches it.
 *
 * LOBSTR is an optional peer dependency — a consumer who only uses another
 * wallet should not have to install it. The dynamic import also keeps the SDK
 * out of the SSR bundle: as a real deferred module it is not inlined into the
 * build output, so a security fix in LOBSTR's API can be applied by the
 * application without a release of this library.
 *
 * When the package is missing, the import rejects with a module resolution
 * error, which is surfaced as a typed `wallet_unavailable` naming the package
 * to install — never as an unhandled rejection or a raw bundler error.
 */
async function loadLobstr(): Promise<LobstrApi> {
  if (lobstrResolved) return lobstrResolved
  if (!lobstrPromise) {
    lobstrPromise = (async () => {
      try {
        const mod = (await import("@lobstrco/signer-extension-api")) as unknown as LobstrApi
        lobstrResolved = mod
        return mod
      } catch {
        throw new WalletAdapterError(
          "wallet_unavailable",
          'Package "@lobstrco/signer-extension-api" is not installed. ' +
            "Install it to use the LOBSTR wallet: npm install @lobstrco/signer-extension-api"
        )
      }
    })()
  }
  return lobstrPromise
}

async function getLobstrNetworkDetails(network: StellarNetwork): Promise<WalletNetworkDetails> {
  // LOBSTR doesn't expose the actual network it's connected to in a queryable way.
  // Instead, we validate that the requested network has a known passphrase,
  // and return that. The validation happens during connect() anyway.
  return {
    network,
    networkPassphrase: requirePassphrase(network),
  }
}

export const lobstrAdapter: WalletAdapter = {
  metadata: {
    type: LOBSTR_WALLET_TYPE,
    name: "LOBSTR",
    supported: true,
    platforms: ["web"],
  },

  async isAvailable() {
    if (typeof navigator !== "undefined" && navigator.product === "ReactNative") return false
    try {
      const lobstr = await loadLobstr()
      return await lobstr.isConnected()
    } catch {
      // If the package is not installed, the wallet is not available
      return false
    }
  },

  async connect(network: StellarNetwork) {
    if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
      throw new WalletAdapterError(
        "wallet_unavailable",
        "LOBSTR cannot be used inside a native app."
      )
    }

    const lobstr = await loadLobstr()
    const isConn = await lobstr.isConnected()

    if (!isConn) {
      throw new WalletAdapterError(
        "wallet_unavailable",
        "LOBSTR wallet not found. Install the LOBSTR browser extension and try again."
      )
    }

    // Validate the network is supported before requesting access
    const networkPassphrase = requirePassphrase(network)

    // Request public key for the Stellar network
    let address: string
    try {
      address = await lobstr.getPublicKey({ network: toLobstrNetwork() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      // Map LOBSTR error messages to wallet adapter error codes
      if (message.includes("User declined")) {
        throw new WalletAdapterError("wallet_access_rejected", message)
      }
      if (message.includes("Network is not supported")) {
        throw new WalletAdapterError("wallet_network_mismatch", message)
      }
      if (message.includes("different network")) {
        throw new WalletAdapterError("wallet_network_mismatch", message)
      }

      throw new WalletAdapterError("wallet_access_rejected", message)
    }

    if (!address) {
      throw new WalletAdapterError(
        "wallet_access_rejected",
        "LOBSTR did not return a wallet address."
      )
    }

    return {
      address,
      wallet: LOBSTR_WALLET_TYPE,
      network,
      networkPassphrase,
    }
  },

  getNetworkDetails: getLobstrNetworkDetails,

  async resolveNetwork(): Promise<WalletNetworkState> {
    const lobstr = await loadLobstr()
    const wallet = await lobstr.getConnectedWallet({ network: toLobstrNetwork() })

    if (!wallet) {
      throw new WalletAdapterError(
        "wallet_access_rejected",
        "No wallet connected on the requested network."
      )
    }

    // The LOBSTR extension returns "stellar" as the network identifier.
    // Since we don't have visibility into whether it's mainnet or testnet,
    // we cannot determine the actual network without making a transaction attempt.
    // We resolve to "custom" when we can't map to a known network.
    const network = resolveNetworkFromPassphrase("stellar")

    return {
      network,
      networkPassphrase: requirePassphrase(network === "custom" ? "mainnet" : network),
    }
  },

  async signTransaction(xdr: string, _options) {
    const lobstr = await loadLobstr()

    try {
      const signedXdr = await lobstr.signTransaction(xdr, {
        network: toLobstrNetwork(),
      })

      if (!signedXdr) {
        throw new WalletAdapterError(
          "wallet_sign_failed",
          "LOBSTR did not return a signed transaction."
        )
      }

      return signedXdr
    } catch (err) {
      if (err instanceof WalletAdapterError) throw err

      const message = err instanceof Error ? err.message : String(err)

      // Map LOBSTR error messages to wallet adapter error codes
      if (message.includes("User declined")) {
        throw new WalletAdapterError("wallet_access_rejected", message)
      }
      if (message.includes("Network is not supported")) {
        throw new WalletAdapterError("wallet_network_mismatch", message)
      }
      if (message.includes("different network")) {
        throw new WalletAdapterError("wallet_network_mismatch", message)
      }
      if (message.includes("not valid")) {
        throw new WalletAdapterError("wallet_sign_failed", message)
      }

      throw new WalletAdapterError("wallet_sign_failed", message)
    }
  },
}
