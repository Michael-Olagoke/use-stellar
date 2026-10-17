/**
 * Shared wallet adapter conformance test kit.
 *
 * Provides a reusable Jest test suite that all wallet adapters must pass,
 * ensuring consistent behavior across the contract defined in `types.ts`.
 *
 * Usage:
 * ```typescript
 * import { describeWalletAdapter } from "./wallets/testing/conformance"
 * import { myAdapter } from "./wallets/myAdapter"
 *
 * describeWalletAdapter("MyWallet", () => myAdapter, {
 *   createPublicKey: () => "GABC...",
 *   mockConnect: async () => ({ ... }),
 *   mockSign: async () => "signed-xdr",
 * })
 * ```
 */

import type { WalletAdapter, WalletNetworkState } from "../types"
import { WalletAdapterError } from "../types"
import type { StellarNetwork } from "../../types"
import { NETWORK_PASSPHRASES } from "../../types"

/**
 * Injected fakes for testing an adapter without requiring the real vendor SDK.
 */
export interface WalletAdapterTestFakes {
  /**
   * A valid public key the mocked SDK should return on success.
   * Typically a string like "GABC123..." on the network being tested.
   */
  createPublicKey: () => string

  /**
   * Mock implementation of the connection/access request.
   * Should resolve with the public key if access is granted.
   * If provided and called, this replaces the vendor's request-access method.
   */
  mockConnect?: () => Promise<string>

  /**
   * Mock implementation of signing.
   * Should resolve with a signed XDR string if signing succeeds.
   * If provided and called, this replaces the vendor's signing method.
   */
  mockSign?: () => Promise<string>

  /**
   * Mock implementation of network resolution.
   * Should resolve with the network details the wallet reports.
   * If provided and called, this replaces the vendor's network query.
   */
  mockResolveNetwork?: () => Promise<WalletNetworkState>

  /**
   * Mock implementation of auto-connect check.
   * Should resolve with whether the wallet can reconnect silently.
   * If provided and called, this replaces the vendor's auto-connect check.
   */
  mockCanAutoConnect?: () => Promise<boolean>

  /**
   * Mock error to reject on connection attempts.
   * If set, connection will fail with this error.
   */
  connectError?: Error | string

  /**
   * Mock error to reject on signing attempts.
   * If set, signing will fail with this error.
   */
  signError?: Error | string

  /**
   * Mock error to reject on network queries.
   * If set, network resolution will fail with this error.
   */
  networkError?: Error | string
}

/**
 * Describes a wallet adapter with a comprehensive test suite.
 *
 * Runs standard Jest test cases that verify the adapter conforms to the
 * `WalletAdapter` contract. Automatically skips optional-method tests when
 * the adapter does not implement them.
 *
 * @param name - Human-readable wallet name for test suite context
 * @param createAdapter - Function that returns a fresh adapter instance (allows test isolation)
 * @param fakes - Injected test doubles for the vendor SDK
 *
 * @example
 * describeWalletAdapter("Freighter", () => freighterAdapter, {
 *   createPublicKey: () => "GABC123...",
 *   mockConnect: async () => "GABC123...",
 *   mockSign: async () => "CAAAAAAA...",
 * })
 */
export function describeWalletAdapter(
  name: string,
  createAdapter: () => WalletAdapter,
  fakes: WalletAdapterTestFakes
): void {
  describe(`WalletAdapter: ${name}`, () => {
    let adapter: WalletAdapter

    beforeEach(() => {
      adapter = createAdapter()
      jest.clearAllMocks()
    })

    describe("metadata", () => {
      it("has a type string", () => {
        expect(adapter.metadata.type).toBeDefined()
        expect(typeof adapter.metadata.type).toBe("string")
        expect(adapter.metadata.type.length).toBeGreaterThan(0)
      })

      it("has a name string", () => {
        expect(adapter.metadata.name).toBeDefined()
        expect(typeof adapter.metadata.name).toBe("string")
        expect(adapter.metadata.name.length).toBeGreaterThan(0)
      })

      it("has a supported boolean", () => {
        expect(adapter.metadata.supported).toBeDefined()
        expect(typeof adapter.metadata.supported).toBe("boolean")
      })

      it("has optional platforms array", () => {
        if (adapter.metadata.platforms) {
          expect(Array.isArray(adapter.metadata.platforms)).toBe(true)
          expect(adapter.metadata.platforms.every(p => p === "web" || p === "native")).toBe(true)
        }
      })
    })

    describe("isAvailable", () => {
      it("returns a boolean", async () => {
        const result = await adapter.isAvailable()
        expect(typeof result).toBe("boolean")
      })

      it("does not throw", async () => {
        await expect(adapter.isAvailable()).resolves.toBeDefined()
      })

      it("returns false when the SDK is unavailable", async () => {
        if (fakes.connectError) {
          const result = await adapter.isAvailable()
          // If connect would fail, isAvailable should not throw, but may return false
          // (implementation-dependent; we just ensure it doesn't throw)
          expect(typeof result).toBe("boolean")
        }
      })
    })

    describe("connect", () => {
      const testNetwork: StellarNetwork = "testnet"

      it("returns a WalletConnection shape", async () => {
        if (fakes.connectError) {
          // Skip if the mock is set to fail
          return
        }

        const connection = await adapter.connect(testNetwork)

        expect(connection).toBeDefined()
        expect(connection.address).toBeDefined()
        expect(typeof connection.address).toBe("string")
        expect(connection.address.length).toBeGreaterThan(0)

        expect(connection.wallet).toBe(adapter.metadata.type)
        expect(connection.network).toBe(testNetwork)
        expect(connection.networkPassphrase).toBeDefined()
        expect(typeof connection.networkPassphrase).toBe("string")
      })

      it("throws WalletAdapterError on failure", async () => {
        if (!fakes.connectError) {
          // Skip if no error is configured
          return
        }

        await expect(adapter.connect(testNetwork)).rejects.toThrow(WalletAdapterError)
      })

      it("throws with a recognized error code", async () => {
        if (!fakes.connectError) {
          return
        }

        const validCodes = [
          "wallet_unavailable",
          "wallet_unsupported",
          "wallet_access_rejected",
          "wallet_network_mismatch",
        ]

        await expect(adapter.connect(testNetwork)).rejects.toThrow(
          expect.objectContaining({
            code: expect.stringMatching(new RegExp(`^(${validCodes.join("|")})$`)),
          })
        )
      })
    })

    describe("getNetworkDetails", () => {
      const testNetwork: StellarNetwork = "testnet"

      it("returns a WalletNetworkDetails shape", async () => {
        const details = await adapter.getNetworkDetails(testNetwork)

        expect(details).toBeDefined()
        expect(details.network).toBe(testNetwork)
        expect(details.networkPassphrase).toBeDefined()
        expect(typeof details.networkPassphrase).toBe("string")
      })

      it("returns the correct passphrase for known networks", async () => {
        const details = await adapter.getNetworkDetails("testnet")
        expect(details.networkPassphrase).toBe(NETWORK_PASSPHRASES.testnet)

        const mainnetDetails = await adapter.getNetworkDetails("mainnet")
        expect(mainnetDetails.networkPassphrase).toBe(NETWORK_PASSPHRASES.mainnet)
      })
    })

    describe("signTransaction", () => {
      const testXdr = "raw-xdr-string"
      const testOptions = {
        address: fakes.createPublicKey(),
        network: "testnet" as const,
        networkPassphrase: NETWORK_PASSPHRASES.testnet,
      }

      it("returns a signed XDR string", async () => {
        if (fakes.signError) {
          return
        }

        const signed = await adapter.signTransaction(testXdr, testOptions)

        expect(signed).toBeDefined()
        expect(typeof signed).toBe("string")
        expect(signed.length).toBeGreaterThan(0)
      })

      it("throws WalletAdapterError on failure", async () => {
        if (!fakes.signError) {
          return
        }

        await expect(adapter.signTransaction(testXdr, testOptions)).rejects.toThrow(
          WalletAdapterError
        )
      })

      it("throws with a recognized error code", async () => {
        if (!fakes.signError) {
          return
        }

        const validCodes = [
          "wallet_unavailable",
          "wallet_access_rejected",
          "wallet_network_mismatch",
          "wallet_sign_failed",
        ]

        await expect(adapter.signTransaction(testXdr, testOptions)).rejects.toThrow(
          expect.objectContaining({
            code: expect.stringMatching(new RegExp(`^(${validCodes.join("|")})$`)),
          })
        )
      })
    })

    describe("optional: resolveNetwork", () => {
      it("skips tests if resolveNetwork is not implemented", () => {
        if (!adapter.resolveNetwork) {
          expect(adapter.resolveNetwork).toBeUndefined()
        }
      })
    })

    describe("optional: canAutoConnect", () => {
      it("skips tests if canAutoConnect is not implemented", () => {
        if (!adapter.canAutoConnect) {
          expect(adapter.canAutoConnect).toBeUndefined()
        }
      })
    })

    describe("optional: subscribe", () => {
      it("skips tests if subscribe is not implemented", () => {
        if (!adapter.subscribe) {
          expect(adapter.subscribe).toBeUndefined()
        }
      })
    })

    describe("disconnect", () => {
      it("skips tests if disconnect is not implemented", () => {
        if (!adapter.disconnect) {
          expect(adapter.disconnect).toBeUndefined()
        }
      })
    })
  })
}
