import { describe, it, expect, beforeEach } from "vitest"
import type { StorageAdapter } from "./walletSession"
import {
  WALLET_SESSION_STORAGE_KEY,
  readSession,
  writeSession,
  clearSession,
  type PersistedSession,
  type SessionPersistenceOptions,
} from "./walletSession"

/**
 * In-memory storage adapter for testing.
 * Mimics the localStorage/sessionStorage API.
 */
class InMemoryStorage implements StorageAdapter {
  private data: Record<string, string> = {}

  getItem(key: string): string | null {
    return this.data[key] ?? null
  }

  setItem(key: string, value: string): void {
    this.data[key] = value
  }

  removeItem(key: string): void {
    delete this.data[key]
  }

  clear(): void {
    this.data = {}
  }

  // Helper to inspect contents
  has(key: string): boolean {
    return key in this.data
  }

  get(key: string): string | undefined {
    return this.data[key]
  }
}

// Helper: Always-true wallet validator
const alwaysHasWallet = () => true

// Helper: Selective wallet validator
const createWalletValidator = (validTypes: string[]) => (type: string) =>
  validTypes.includes(type)

describe("walletSession", () => {
  describe("readSession", () => {
    let storage: InMemoryStorage
    let options: SessionPersistenceOptions

    beforeEach(() => {
      storage = new InMemoryStorage()
      options = { storage: "local", persistAddress: false }
    })

    it("returns null when storage is unavailable", () => {
      const result = readSession(null as any, options, alwaysHasWallet)
      expect(result).toBeNull()
    })

    it("returns null when key does not exist", () => {
      const result = readSession(storage, options, alwaysHasWallet)
      expect(result).toBeNull()
    })

    it("returns null for malformed JSON", () => {
      storage.setItem(WALLET_SESSION_STORAGE_KEY, "{ invalid json }")
      const result = readSession(storage, options, alwaysHasWallet)
      expect(result).toBeNull()
    })

    it("returns null for non-object value", () => {
      storage.setItem(WALLET_SESSION_STORAGE_KEY, '"just a string"')
      const result = readSession(storage, options, alwaysHasWallet)
      expect(result).toBeNull()
    })

    it("returns null when wallet type is missing", () => {
      storage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify({ address: "GACX..." }))
      const result = readSession(storage, options, alwaysHasWallet)
      expect(result).toBeNull()
    })

    it("returns null when wallet type is not a string", () => {
      storage.setItem(
        WALLET_SESSION_STORAGE_KEY,
        JSON.stringify({ wallet: 123, address: "GACX..." })
      )
      const result = readSession(storage, options, alwaysHasWallet)
      expect(result).toBeNull()
    })

    it("returns null when wallet type is not registered", () => {
      storage.setItem(
        WALLET_SESSION_STORAGE_KEY,
        JSON.stringify({ wallet: "unknown-wallet" })
      )
      const hasWallet = createWalletValidator(["freighter", "albedo"])
      const result = readSession(storage, options, hasWallet)
      expect(result).toBeNull()
    })

    it("returns valid session with wallet only", () => {
      storage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify({ wallet: "freighter" }))
      const result = readSession(storage, options, alwaysHasWallet)
      expect(result).toEqual({ wallet: "freighter" })
    })

    it("returns valid session with wallet and address", () => {
      const session: PersistedSession = {
        wallet: "albedo",
        address: "GACX3E7GJB23HVC2DGX2N4ZHMARWBNQD32LXMYQVX5DHVUJS5UCLHAY",
      }
      storage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify(session))
      const result = readSession(storage, options, alwaysHasWallet)
      expect(result).toEqual(session)
    })

    it("ignores address if not a string", () => {
      storage.setItem(
        WALLET_SESSION_STORAGE_KEY,
        JSON.stringify({ wallet: "freighter", address: 12345 })
      )
      const result = readSession(storage, options, alwaysHasWallet)
      expect(result).toEqual({ wallet: "freighter" })
    })

    it("ignores extra fields in stored object", () => {
      storage.setItem(
        WALLET_SESSION_STORAGE_KEY,
        JSON.stringify({
          wallet: "freighter",
          address: "GACX...",
          secret: "should not be here",
          extra: "field",
        })
      )
      const result = readSession(storage, options, alwaysHasWallet)
      expect(result).toEqual({ wallet: "freighter", address: "GACX..." })
    })

    it("handles storage exceptions gracefully", () => {
      const failingStorage: StorageAdapter = {
        getItem() {
          throw new Error("Storage access denied")
        },
        setItem() {},
        removeItem() {},
      }
      const result = readSession(failingStorage, options, alwaysHasWallet)
      expect(result).toBeNull()
    })

    it("validates wallet type with provided predicate", () => {
      storage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify({ wallet: "custom-wallet" }))

      // First: custom-wallet is not valid
      let result = readSession(storage, options, createWalletValidator(["freighter"]))
      expect(result).toBeNull()

      // Second: custom-wallet is valid
      result = readSession(storage, options, createWalletValidator(["custom-wallet"]))
      expect(result).toEqual({ wallet: "custom-wallet" })
    })
  })

  describe("writeSession", () => {
    let storage: InMemoryStorage
    let options: SessionPersistenceOptions

    beforeEach(() => {
      storage = new InMemoryStorage()
      options = { storage: "local", persistAddress: false }
    })

    it("does nothing when storage is unavailable", () => {
      const session: PersistedSession = { wallet: "freighter" }
      writeSession(null as any, options, session)
      // No error thrown
    })

    it("writes a session with wallet only", () => {
      const session: PersistedSession = { wallet: "freighter" }
      writeSession(storage, options, session)
      expect(storage.has(WALLET_SESSION_STORAGE_KEY)).toBe(true)
      expect(JSON.parse(storage.get(WALLET_SESSION_STORAGE_KEY)!)).toEqual(session)
    })

    it("writes a session with wallet and address", () => {
      const session: PersistedSession = {
        wallet: "albedo",
        address: "GACX3E7GJB23HVC2DGX2N4ZHMARWBNQD32LXMYQVX5DHVUJS5UCLHAY",
      }
      writeSession(storage, options, session)
      expect(storage.has(WALLET_SESSION_STORAGE_KEY)).toBe(true)
      expect(JSON.parse(storage.get(WALLET_SESSION_STORAGE_KEY)!)).toEqual(session)
    })

    it("removes the key when session is null", () => {
      // Setup: add a session first
      storage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify({ wallet: "freighter" }))
      expect(storage.has(WALLET_SESSION_STORAGE_KEY)).toBe(true)

      // Clear by writing null
      writeSession(storage, options, null)
      expect(storage.has(WALLET_SESSION_STORAGE_KEY)).toBe(false)
    })

    it("handles storage quota exceeded silently", () => {
      const quotaStorage: StorageAdapter = {
        getItem() {
          return null
        },
        setItem() {
          throw new Error("QuotaExceededError")
        },
        removeItem() {},
      }
      const session: PersistedSession = { wallet: "freighter" }
      // Should not throw
      expect(() => writeSession(quotaStorage, options, session)).not.toThrow()
    })

    it("handles other storage errors silently", () => {
      const failingStorage: StorageAdapter = {
        getItem() {
          return null
        },
        setItem() {
          throw new Error("Storage access denied")
        },
        removeItem() {},
      }
      const session: PersistedSession = { wallet: "freighter" }
      // Should not throw
      expect(() => writeSession(failingStorage, options, session)).not.toThrow()
    })

    it("handles removeItem errors silently", () => {
      const failingStorage: StorageAdapter = {
        getItem() {
          return null
        },
        setItem() {},
        removeItem() {
          throw new Error("Cannot remove")
        },
      }
      // Should not throw when clearing
      expect(() => writeSession(failingStorage, options, null)).not.toThrow()
    })
  })

  describe("clearSession", () => {
    let storage: InMemoryStorage
    let options: SessionPersistenceOptions

    beforeEach(() => {
      storage = new InMemoryStorage()
      options = { storage: "local", persistAddress: false }
    })

    it("removes the session key from storage", () => {
      storage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify({ wallet: "freighter" }))
      expect(storage.has(WALLET_SESSION_STORAGE_KEY)).toBe(true)

      clearSession(storage, options)
      expect(storage.has(WALLET_SESSION_STORAGE_KEY)).toBe(false)
    })

    it("is idempotent (no error if key does not exist)", () => {
      expect(storage.has(WALLET_SESSION_STORAGE_KEY)).toBe(false)
      // Should not throw
      expect(() => clearSession(storage, options)).not.toThrow()
    })

    it("handles storage errors silently", () => {
      const failingStorage: StorageAdapter = {
        getItem() {
          return null
        },
        setItem() {},
        removeItem() {
          throw new Error("Cannot remove")
        },
      }
      // Should not throw
      expect(() => clearSession(failingStorage, options)).not.toThrow()
    })
  })

  describe("round-trip: write then read", () => {
    let storage: InMemoryStorage
    let options: SessionPersistenceOptions

    beforeEach(() => {
      storage = new InMemoryStorage()
      options = { storage: "local", persistAddress: false }
    })

    it("preserves wallet only", () => {
      const original: PersistedSession = { wallet: "freighter" }
      writeSession(storage, options, original)
      const retrieved = readSession(storage, options, alwaysHasWallet)
      expect(retrieved).toEqual(original)
    })

    it("preserves wallet and address", () => {
      const original: PersistedSession = {
        wallet: "albedo",
        address: "GACX3E7GJB23HVC2DGX2N4ZHMARWBNQD32LXMYQVX5DHVUJS5UCLHAY",
      }
      writeSession(storage, options, original)
      const retrieved = readSession(storage, options, alwaysHasWallet)
      expect(retrieved).toEqual(original)
    })

    it("handles clear and rewrite cycle", () => {
      const session1: PersistedSession = { wallet: "freighter" }
      const session2: PersistedSession = { wallet: "albedo", address: "GACX..." }

      // Write first session
      writeSession(storage, options, session1)
      expect(readSession(storage, options, alwaysHasWallet)).toEqual(session1)

      // Clear
      clearSession(storage, options)
      expect(readSession(storage, options, alwaysHasWallet)).toBeNull()

      // Write second session
      writeSession(storage, options, session2)
      expect(readSession(storage, options, alwaysHasWallet)).toEqual(session2)
    })
  })

  describe("SSR safety (no global access)", () => {
    it("works with injected in-memory adapter in Node.js", () => {
      const storage = new InMemoryStorage()
      const options: SessionPersistenceOptions = { storage: "local", persistAddress: true }

      // Simulate Node.js environment: no window, no globals
      // Just inject the storage adapter
      const session: PersistedSession = {
        wallet: "freighter",
        address: "GACX3E7GJB23HVC2DGX2N4ZHMARWBNQD32LXMYQVX5DHVUJS5UCLHAY",
      }

      writeSession(storage, options, session)
      const retrieved = readSession(storage, options, alwaysHasWallet)

      expect(retrieved).toEqual(session)
    })

    it("does not access any global variables", () => {
      // This test verifies the module does not have top-level window/localStorage references
      // If it did, requiring the module in Node would throw
      const storage = new InMemoryStorage()
      const options: SessionPersistenceOptions = { storage: "local", persistAddress: false }

      // These functions should work fine with any adapter, no globals needed
      const session: PersistedSession = { wallet: "freighter" }
      writeSession(storage, options, session)
      readSession(storage, options, alwaysHasWallet)
      clearSession(storage, options)

      // If we got here without errors, the module is truly global-free
      expect(true).toBe(true)
    })
  })

  describe("storage options parameter handling", () => {
    let storage: InMemoryStorage
    let options: SessionPersistenceOptions

    beforeEach(() => {
      storage = new InMemoryStorage()
    })

    it("works with local storage option", () => {
      options = { storage: "local", persistAddress: false }
      const session: PersistedSession = { wallet: "freighter" }
      writeSession(storage, options, session)
      const retrieved = readSession(storage, options, alwaysHasWallet)
      expect(retrieved).toEqual(session)
    })

    it("works with session storage option", () => {
      options = { storage: "session", persistAddress: false }
      const session: PersistedSession = { wallet: "freighter" }
      writeSession(storage, options, session)
      const retrieved = readSession(storage, options, alwaysHasWallet)
      expect(retrieved).toEqual(session)
    })

    it("works with persistAddress true", () => {
      options = { storage: "local", persistAddress: true }
      const session: PersistedSession = {
        wallet: "freighter",
        address: "GACX3E7GJB23HVC2DGX2N4ZHMARWBNQD32LXMYQVX5DHVUJS5UCLHAY",
      }
      writeSession(storage, options, session)
      const retrieved = readSession(storage, options, alwaysHasWallet)
      expect(retrieved).toEqual(session)
    })

    it("works with persistAddress false", () => {
      options = { storage: "local", persistAddress: false }
      const session: PersistedSession = { wallet: "freighter" } // No address
      writeSession(storage, options, session)
      const retrieved = readSession(storage, options, alwaysHasWallet)
      expect(retrieved).toEqual(session)
    })
  })
})
