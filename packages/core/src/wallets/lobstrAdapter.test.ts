import { lobstrAdapter } from "./lobstrAdapter"
import { NETWORK_PASSPHRASES } from "./constants"
import type { StellarNetwork } from "../types"

jest.mock("@lobstrco/signer-extension-api", () => ({
  isConnected: jest.fn(),
  getPublicKey: jest.fn(),
  getConnectedWallet: jest.fn(),
  signTransaction: jest.fn(),
}))

// Use jest.requireMock to get type-safe references to the mocked functions
const {
  isConnected: mockIsConnected,
  getPublicKey: mockGetPublicKey,
  getConnectedWallet: mockGetConnectedWallet,
  signTransaction: mockSignTransaction,
} = jest.requireMock("@lobstrco/signer-extension-api") as {
  isConnected: jest.Mock
  getPublicKey: jest.Mock
  getConnectedWallet: jest.Mock
  signTransaction: jest.Mock
}

describe("lobstrAdapter", () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe("metadata", () => {
    it("has correct metadata", () => {
      expect(lobstrAdapter.metadata).toEqual({
        type: "lobstr",
        name: "LOBSTR",
        supported: true,
        platforms: ["web"],
      })
    })
  })

  describe("isAvailable", () => {
    it("returns true when LOBSTR is connected", async () => {
      mockIsConnected.mockResolvedValue(true)

      await expect(lobstrAdapter.isAvailable()).resolves.toBe(true)
    })

    it("returns false when LOBSTR is not connected", async () => {
      mockIsConnected.mockResolvedValue(false)

      await expect(lobstrAdapter.isAvailable()).resolves.toBe(false)
    })

    it("returns false when the package is not installed", async () => {
      mockIsConnected.mockRejectedValue(new Error("Cannot find module"))

      await expect(lobstrAdapter.isAvailable()).resolves.toBe(false)
    })
  })

  describe("connect", () => {
    it("connects with LOBSTR on the requested network", async () => {
      mockIsConnected.mockResolvedValue(true)
      mockGetPublicKey.mockResolvedValue("GABC")

      await expect(lobstrAdapter.connect("testnet")).resolves.toEqual({
        address: "GABC",
        network: "testnet",
        networkPassphrase: NETWORK_PASSPHRASES.testnet,
        wallet: "lobstr",
      })
    })

    it("connects with LOBSTR on mainnet", async () => {
      mockIsConnected.mockResolvedValue(true)
      mockGetPublicKey.mockResolvedValue("GDEF")

      await expect(lobstrAdapter.connect("mainnet")).resolves.toEqual({
        address: "GDEF",
        network: "mainnet",
        networkPassphrase: NETWORK_PASSPHRASES.mainnet,
        wallet: "lobstr",
      })
    })

    it("throws wallet_unavailable when LOBSTR is not installed", async () => {
      mockIsConnected.mockResolvedValue(false)

      await expect(lobstrAdapter.connect("testnet")).rejects.toMatchObject({
        code: "wallet_unavailable",
        message: expect.stringContaining("LOBSTR wallet not found"),
      })
    })

    it("throws wallet_access_rejected when user declines access", async () => {
      mockIsConnected.mockResolvedValue(true)
      mockGetPublicKey.mockRejectedValue(new Error("User declined access"))

      await expect(lobstrAdapter.connect("testnet")).rejects.toMatchObject({
        code: "wallet_access_rejected",
        message: expect.stringContaining("User declined"),
      })
    })

    it("throws wallet_network_mismatch when network is not supported", async () => {
      mockIsConnected.mockResolvedValue(true)
      mockGetPublicKey.mockRejectedValue(new Error("Network is not supported"))

      await expect(lobstrAdapter.connect("testnet")).rejects.toMatchObject({
        code: "wallet_network_mismatch",
      })
    })

    it("throws wallet_network_mismatch when wallet is on a different network", async () => {
      mockIsConnected.mockResolvedValue(true)
      mockGetPublicKey.mockRejectedValue(
        new Error("The connected wallet belongs to a different network")
      )

      await expect(lobstrAdapter.connect("testnet")).rejects.toMatchObject({
        code: "wallet_network_mismatch",
      })
    })

    it("throws wallet_access_rejected when LOBSTR does not return an address", async () => {
      mockIsConnected.mockResolvedValue(true)
      mockGetPublicKey.mockResolvedValue("")

      await expect(lobstrAdapter.connect("testnet")).rejects.toMatchObject({
        code: "wallet_access_rejected",
        message: expect.stringContaining("did not return a wallet address"),
      })
    })

    it("throws wallet_unsupported when the network has no passphrase", async () => {
      mockIsConnected.mockResolvedValue(true)

      // Use a fake network that has no passphrase
      await expect(
        lobstrAdapter.connect("invalid-network" as unknown as StellarNetwork)
      ).rejects.toMatchObject({
        code: "wallet_unsupported",
      })
    })
  })

  describe("getNetworkDetails", () => {
    it("returns network details for testnet", async () => {
      await expect(lobstrAdapter.getNetworkDetails("testnet")).resolves.toEqual({
        network: "testnet",
        networkPassphrase: NETWORK_PASSPHRASES.testnet,
      })
    })

    it("returns network details for mainnet", async () => {
      await expect(lobstrAdapter.getNetworkDetails("mainnet")).resolves.toEqual({
        network: "mainnet",
        networkPassphrase: NETWORK_PASSPHRASES.mainnet,
      })
    })

    it("throws for unsupported networks", async () => {
      await expect(
        lobstrAdapter.getNetworkDetails("invalid-network" as unknown as StellarNetwork)
      ).rejects.toMatchObject({
        code: "wallet_unsupported",
      })
    })
  })

  describe("resolveNetwork", () => {
    it("returns the connected wallet's network", async () => {
      mockGetConnectedWallet.mockResolvedValue({
        publicKey: "GABC",
        network: "stellar",
      })

      const result = await lobstrAdapter.resolveNetwork?.()
      expect(result).toMatchObject({
        network: expect.any(String),
        networkPassphrase: expect.any(String),
      })
    })

    it("throws wallet_access_rejected when no wallet is connected", async () => {
      mockGetConnectedWallet.mockResolvedValue(null)

      await expect(lobstrAdapter.resolveNetwork?.()).rejects.toMatchObject({
        code: "wallet_access_rejected",
      })
    })
  })

  describe("signTransaction", () => {
    it("signs transactions through LOBSTR", async () => {
      mockSignTransaction.mockResolvedValue("signed-xdr")

      await expect(
        lobstrAdapter.signTransaction("raw-xdr", {
          address: "GABC",
          network: "testnet",
          networkPassphrase: NETWORK_PASSPHRASES.testnet,
        })
      ).resolves.toBe("signed-xdr")
    })

    it("throws wallet_access_rejected when user declines signing", async () => {
      mockSignTransaction.mockRejectedValue(new Error("User declined access"))

      await expect(
        lobstrAdapter.signTransaction("raw-xdr", {
          address: "GABC",
          network: "testnet",
          networkPassphrase: NETWORK_PASSPHRASES.testnet,
        })
      ).rejects.toMatchObject({
        code: "wallet_access_rejected",
      })
    })

    it("throws wallet_network_mismatch when wallet is on wrong network", async () => {
      mockSignTransaction.mockRejectedValue(
        new Error("The connected wallet belongs to a different network")
      )

      await expect(
        lobstrAdapter.signTransaction("raw-xdr", {
          address: "GABC",
          network: "testnet",
          networkPassphrase: NETWORK_PASSPHRASES.testnet,
        })
      ).rejects.toMatchObject({
        code: "wallet_network_mismatch",
      })
    })

    it("throws wallet_sign_failed for invalid transactions", async () => {
      mockSignTransaction.mockRejectedValue(
        new Error("The transaction payload is not valid for this network")
      )

      await expect(
        lobstrAdapter.signTransaction("invalid-xdr", {
          address: "GABC",
          network: "testnet",
          networkPassphrase: NETWORK_PASSPHRASES.testnet,
        })
      ).rejects.toMatchObject({
        code: "wallet_sign_failed",
      })
    })

    it("throws wallet_sign_failed when signing fails", async () => {
      mockSignTransaction.mockRejectedValue(new Error("Sign failed"))

      await expect(
        lobstrAdapter.signTransaction("raw-xdr", {
          address: "GABC",
          network: "testnet",
          networkPassphrase: NETWORK_PASSPHRASES.testnet,
        })
      ).rejects.toMatchObject({
        code: "wallet_sign_failed",
      })
    })

    it("throws wallet_sign_failed when no signed XDR is returned", async () => {
      mockSignTransaction.mockResolvedValue("")

      await expect(
        lobstrAdapter.signTransaction("raw-xdr", {
          address: "GABC",
          network: "testnet",
          networkPassphrase: NETWORK_PASSPHRASES.testnet,
        })
      ).rejects.toMatchObject({
        code: "wallet_sign_failed",
      })
    })
  })
})

describe("lobstrAdapter — missing optional peer", () => {
  it("surfaces wallet_unavailable naming the package when the SDK is not installed", async () => {
    jest.resetModules()
    jest.doMock("@lobstrco/signer-extension-api", () => {
      throw new Error("Cannot find module '@lobstrco/signer-extension-api'")
    })

    const { lobstrAdapter: freshAdapter } = await import("./lobstrAdapter")

    await expect(freshAdapter.connect("testnet")).rejects.toMatchObject({
      code: "wallet_unavailable",
    })
    await expect(freshAdapter.connect("testnet")).rejects.toThrow("@lobstrco/signer-extension-api")
  })
})

describe("lobstrAdapter — native runtime", () => {
  let originalNavigator: unknown

  beforeEach(() => {
    originalNavigator = global.navigator
    Object.defineProperty(global, "navigator", {
      value: { product: "ReactNative" },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
    })
  })

  it("isAvailable returns false", async () => {
    await expect(lobstrAdapter.isAvailable()).resolves.toBe(false)
  })

  it("connect rejects with wallet_unavailable", async () => {
    await expect(lobstrAdapter.connect("testnet")).rejects.toMatchObject({
      code: "wallet_unavailable",
      message: expect.stringContaining("native app"),
    })
  })
})
