import type { WalletType } from "../types"

/**
 * Storage key holding the persisted wallet session.
 * Exported so both React and Vue adapters reference the same key.
 */
export const WALLET_SESSION_STORAGE_KEY = "use-stellar:wallet-session"

/**
 * Minimal storage interface for wallet session persistence.
 * Implementations can be localStorage, sessionStorage, or any storage adapter.
 */
export interface StorageAdapter {
  /**
   * Retrieve a value by key. Returns null if the key does not exist or
   * storage is unavailable.
   */
  getItem(key: string): string | null
  /**
   * Set a key-value pair. Should handle quota errors gracefully by throwing
   * or silently failing — the caller will catch and handle.
   */
  setItem(key: string, value: string): void
  /**
   * Remove a key. Should be idempotent — removing a non-existent key is safe.
   */
  removeItem(key: string): void
}

/**
 * The shape persisted to storage. Nothing here is secret.
 *
 * - `wallet`: The wallet type string (e.g. "freighter", "albedo")
 * - `address`: Optional public address (only if persistAddress enabled)
 */
export interface PersistedSession {
  wallet: string
  address?: string
}

/**
 * Options that control wallet session persistence behavior.
 * Matches the AutoConnectOptions shape from the provider.
 */
export interface SessionPersistenceOptions {
  /** Where to store: "local" (localStorage) or "session" (sessionStorage). */
  storage: "local" | "session"
  /** Whether to also persist the public address. */
  persistAddress: boolean
}

/**
 * Reads the persisted wallet session from the provided storage adapter.
 *
 * Validates the stored value before returning it:
 * - Rejects malformed JSON
 * - Rejects invalid structure (missing wallet type, non-string wallet)
 * - Validates the wallet type against the registry
 * - Treats invalid/unavailable storage as a safe "no session" result
 *
 * This function is storage-agnostic: it does not access window or any global.
 * All storage access happens through the adapter.
 *
 * @param adapter - StorageAdapter (localStorage, sessionStorage, or in-memory)
 * @param options - Persistence options (used only for key selection currently)
 * @param hasWallet - A predicate to validate if a wallet type is registered
 * @returns A valid PersistedSession, or null if storage is unavailable, malformed, or invalid
 */
export function readSession(
  adapter: StorageAdapter,
  _options: SessionPersistenceOptions,
  hasWallet: (type: string) => boolean
): PersistedSession | null {
  if (!adapter) return null

  try {
    const raw = adapter.getItem(WALLET_SESSION_STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null

    const { wallet, address } = parsed as Record<string, unknown>

    // Validate wallet type: must be a non-empty string that exists in the registry
    if (typeof wallet !== "string" || !hasWallet(wallet)) {
      return null
    }

    // Address is optional; if present, it must be a string
    return {
      wallet,
      address: typeof address === "string" ? address : undefined,
    }
  } catch {
    // Malformed JSON, storage access error, or other parsing failure
    return null
  }
}

/**
 * Writes or clears the persisted wallet session to the provided storage adapter.
 *
 * - If `session` is provided, it is serialized and written to storage
 * - If `session` is null, the key is removed from storage
 *
 * Storage quota errors, access failures, and other exceptions are caught and
 * silently ignored — losing the ability to restore a session should never
 * break the application.
 *
 * This function is storage-agnostic: it does not access window or any global.
 * All storage access happens through the adapter.
 *
 * @param adapter - StorageAdapter (localStorage, sessionStorage, or in-memory)
 * @param _options - Persistence options (used only for key selection currently)
 * @param session - The session to persist, or null to remove it
 */
export function writeSession(
  adapter: StorageAdapter,
  _options: SessionPersistenceOptions,
  session: PersistedSession | null
): void {
  if (!adapter) return

  try {
    if (session) {
      adapter.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify(session))
    } else {
      adapter.removeItem(WALLET_SESSION_STORAGE_KEY)
    }
  } catch {
    // Quota exceeded, or storage disabled mid-session. Losing the ability to
    // persist the session is never a reason to break the app.
  }
}

/**
 * Clears the persisted wallet session from storage.
 *
 * Equivalent to `writeSession(adapter, options, null)` but more explicit
 * about intent. Errors are caught and ignored.
 *
 * @param adapter - StorageAdapter
 * @param _options - Persistence options
 */
export function clearSession(adapter: StorageAdapter, _options: SessionPersistenceOptions): void {
  writeSession(adapter, _options, null)
}
