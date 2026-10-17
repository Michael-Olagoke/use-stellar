/**
 * Tests for the conformance suite itself.
 *
 * Verifies that describeWalletAdapter catches contract violations and passes
 * correct implementations.
 */

import { describeWalletAdapter, type WalletAdapterTestFakes } from "./conformance"
import type { WalletAdapter } from "../types"
import { NETWORK_PASSPHRASES } from "../../types"

/**
 * A minimal correct implementation of WalletAdapter for testing the suite.
 */
function createCorrectAdapter(): WalletAdapter {
  return {
    metadata: {
      type: "test-wallet",
      name: "Test Wallet",
      supported: true,
      platforms: ["web"],
    },

    async isAvailable() {
      return true
    },

    async connect(network) {
      return {
        address: "GABC123",
        wallet: "test-wallet",
        network,
        networkPassphrase: NETWORK_PASSPHRASES[network as keyof typeof NETWORK_PASSPHRASES] || "",
      }
    },

    async getNetworkDetails(network) {
      return {
        network,
        networkPassphrase: NETWORK_PASSPHRASES[network as keyof typeof NETWORK_PASSPHRASES] || "",
      }
    },

    async signTransaction(xdr) {
      return `signed-${xdr}`
    },

    async resolveNetwork() {
      return {
        network: "testnet",
        networkPassphrase: NETWORK_PASSPHRASES.testnet,
      }
    },

    async canAutoConnect() {
      return false
    },

    subscribe(_handler) {
      // Minimal no-op implementation
      return () => {
        // unsubscribe
      }
    },
  }
}

function createMinimalAdapter(): WalletAdapter {
  return {
    metadata: {
      type: "minimal-wallet",
      name: "Minimal Wallet",
      supported: true,
    },

    async isAvailable() {
      return true
    },

    async connect(network) {
      return {
        address: "GABC123",
        wallet: "minimal-wallet",
        network,
        networkPassphrase: NETWORK_PASSPHRASES[network as keyof typeof NETWORK_PASSPHRASES] || "",
      }
    },

    async getNetworkDetails(network) {
      return {
        network,
        networkPassphrase: NETWORK_PASSPHRASES[network as keyof typeof NETWORK_PASSPHRASES] || "",
      }
    },

    async signTransaction(xdr) {
      return `signed-${xdr}`
    },
  }
}

function createFullAdapter(): WalletAdapter {
  return {
    metadata: {
      type: "full-wallet",
      name: "Full Wallet",
      supported: true,
      platforms: ["web", "native"],
    },

    async isAvailable() {
      return true
    },

    async connect(network) {
      return {
        address: "GNOP345",
        wallet: "full-wallet",
        network,
        networkPassphrase: NETWORK_PASSPHRASES[network as keyof typeof NETWORK_PASSPHRASES] || "",
      }
    },

    async getNetworkDetails(network) {
      return {
        network,
        networkPassphrase: NETWORK_PASSPHRASES[network as keyof typeof NETWORK_PASSPHRASES] || "",
      }
    },

    async signTransaction(xdr) {
      return `signed-${xdr}`
    },

    async disconnect() {
      // disconnect implementation
    },

    async resolveNetwork() {
      return {
        network: "mainnet",
        networkPassphrase: NETWORK_PASSPHRASES.mainnet,
      }
    },

    async canAutoConnect() {
      return true
    },

    subscribe(handler) {
      const timeoutId = setTimeout(() => {
        handler({
          address: null,
          network: "testnet",
          networkPassphrase: NETWORK_PASSPHRASES.testnet,
        })
      }, 100)

      return () => clearTimeout(timeoutId)
    },
  }
}

describe("describeWalletAdapter conformance suite", () => {
  describe("with a correct adapter implementation", () => {
    const fakes: WalletAdapterTestFakes = {
      createPublicKey: () => "GABC123",
    }

    describeWalletAdapter("Correct Test Adapter", () => createCorrectAdapter(), fakes)
  })

  describe("adapter with optional methods omitted", () => {
    const fakes: WalletAdapterTestFakes = {
      createPublicKey: () => "GDEF456",
    }

    describeWalletAdapter("Minimal Test Adapter", () => createMinimalAdapter(), fakes)
  })

  describe("adapter with all optional methods", () => {
    const fakes: WalletAdapterTestFakes = {
      createPublicKey: () => "GNOP345",
    }

    describeWalletAdapter("Full Featured Test Adapter", () => createFullAdapter(), fakes)
  })
})
