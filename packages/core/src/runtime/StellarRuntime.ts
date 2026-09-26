import type { NetworkConfig, StellarNetwork, WalletState } from "../types"
import { NETWORK_CONFIGS } from "../types"
import { QueryStore } from "../cache"
import type { QueryConfig } from "../cache"

/**
 * Immutable snapshot of the runtime's current state.
 * Consumers must not mutate this object; all state updates flow through
 * explicit runtime methods that notify subscribers.
 */
export interface StellarRuntimeSnapshot {
  /** The Stellar network environment. */
  network: StellarNetwork
  /** Resolved configuration for the active network. */
  networkConfig: NetworkConfig
  /** Current wallet connection state. */
  wallet: WalletState
  /** Shared query/cache store. */
  queryStore: QueryStore
}

/**
 * Listener called when any part of the runtime state changes.
 * Receives the new snapshot and must treat it as immutable.
 */
export type StellarRuntimeListener = (snapshot: StellarRuntimeSnapshot) => void

/**
 * Options for creating a StellarRuntime.
 */
export interface CreateStellarRuntimeOptions {
  /** The Stellar network environment. Defaults to "testnet". */
  network?: StellarNetwork
  /** Optional override for Horizon and Soroban RPC endpoints and network passphrase. */
  networkConfig?: {
    horizonUrl: string
    sorobanUrl: string
    networkPassphrase?: string
  }
  /** Cache configuration (staleTime and gcTime, in milliseconds). */
  queryConfig?: QueryConfig
}

/**
 * The default wallet state (no wallet connected).
 */
const DEFAULT_WALLET: WalletState = {
  connected: false,
  connecting: false,
  address: null,
  network: null,
  wallet: null,
  walletName: null,
  error: null,
  walletNetwork: null,
  walletNetworkPassphrase: null,
}

/**
 * Validates a custom network config and returns the merged NetworkConfig.
 * Throws a descriptive error if anything required is missing.
 */
function resolveNetworkConfig(
  network: StellarNetwork,
  override:
    | {
        horizonUrl: string
        sorobanUrl: string
        networkPassphrase?: string
      }
    | undefined
): NetworkConfig {
  const builtIn = network === "custom" ? undefined : NETWORK_CONFIGS[network]

  if (!override) {
    if (!builtIn) {
      throw new Error(
        'use-stellar: network="custom" requires a networkConfig with ' +
          "`horizonUrl`, `sorobanUrl`, and `networkPassphrase`. " +
          'Example: { horizonUrl: "http://localhost:8000", ' +
          'sorobanUrl: "http://localhost:8000/soroban/rpc", ' +
          'networkPassphrase: "Standalone Network ; February 2017" }'
      )
    }
    return builtIn
  }

  const { horizonUrl, sorobanUrl, networkPassphrase } = override

  if (!horizonUrl || typeof horizonUrl !== "string" || horizonUrl.trim() === "") {
    throw new Error(
      "use-stellar: Invalid networkConfig — `horizonUrl` is required when " +
        "providing a custom networkConfig. " +
        'Example: { horizonUrl: "https://horizon.my-node.com", sorobanUrl: "..." }'
    )
  }

  if (!sorobanUrl || typeof sorobanUrl !== "string" || sorobanUrl.trim() === "") {
    throw new Error(
      "use-stellar: Invalid networkConfig — `sorobanUrl` is required when " +
        "providing a custom networkConfig. " +
        'Example: { horizonUrl: "...", sorobanUrl: "https://rpc.my-node.com" }'
    )
  }

  const hasPassphrase = typeof networkPassphrase === "string" && networkPassphrase.trim() !== ""

  if (!hasPassphrase && !builtIn) {
    throw new Error(
      'use-stellar: Invalid networkConfig — `networkPassphrase` is required when network="custom". ' +
        "There is no default passphrase for a network this library ships no configuration for, and " +
        "guessing one would sign transactions that the target network rejects. " +
        'Example: { networkPassphrase: "Standalone Network ; February 2017" }'
    )
  }

  return {
    network,
    horizonUrl: horizonUrl.trim(),
    sorobanUrl: sorobanUrl.trim(),
    networkPassphrase: hasPassphrase
      ? (networkPassphrase as string).trim()
      : (builtIn as NetworkConfig).networkPassphrase,
  }
}

/**
 * A framework-neutral Stellar runtime that owns state and exposes snapshots plus subscriptions.
 *
 * The runtime manages three core pieces of state:
 * - Network configuration (resolved once at creation)
 * - Wallet connection state
 * - QueryStore (shared cache and request deduplication)
 *
 * React and Vue can each adapt this runtime to their own reactivity models
 * by subscribing to updates and storing snapshots in their respective state
 * systems (useState, ref/reactive, etc.).
 *
 * State is immutable: consumers receive snapshots and must not mutate them directly.
 * All updates flow through explicit methods that notify subscribers exactly once per change.
 */
export class StellarRuntime {
  private network: StellarNetwork
  private networkConfig: NetworkConfig
  private wallet: WalletState
  private queryStore: QueryStore
  private listeners = new Set<StellarRuntimeListener>()

  /**
   * Creates a new StellarRuntime.
   *
   * @throws {Error} If network configuration validation fails.
   */
  constructor(options: CreateStellarRuntimeOptions = {}) {
    this.network = options.network ?? "testnet"
    this.networkConfig = resolveNetworkConfig(this.network, options.networkConfig)
    this.wallet = { ...DEFAULT_WALLET, network: this.network }
    this.queryStore = new QueryStore(options.queryConfig)
  }

  /**
   * Returns an immutable snapshot of the current runtime state.
   * Safe to call at any time without side effects.
   * Consumers must treat the snapshot as read-only.
   */
  getSnapshot(): StellarRuntimeSnapshot {
    return {
      network: this.network,
      networkConfig: this.networkConfig,
      wallet: { ...this.wallet },
      queryStore: this.queryStore,
    }
  }

  /**
   * Registers a listener to be called whenever the runtime state changes.
   * The listener receives the new snapshot immediately upon any state update.
   *
   * @returns An unsubscribe function. Call it to remove the listener and stop receiving updates.
   */
  subscribe(listener: StellarRuntimeListener): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Updates the network and resolves its configuration.
   * Notifies all subscribers exactly once.
   *
   * @throws {Error} If the new network configuration is invalid.
   */
  setNetwork(network: StellarNetwork, networkConfig?: CreateStellarRuntimeOptions["networkConfig"]): void {
    const newConfig = resolveNetworkConfig(network, networkConfig)

    // Only notify if something actually changed.
    if (this.network === network && JSON.stringify(this.networkConfig) === JSON.stringify(newConfig)) {
      return
    }

    this.network = network
    this.networkConfig = newConfig

    // Update wallet's network reference to stay in sync.
    this.wallet = { ...this.wallet, network }

    this.notifyListeners()
  }

  /**
   * Updates the wallet state.
   * Notifies all subscribers exactly once.
   */
  setWallet(wallet: WalletState): void {
    // Only notify if something actually changed.
    if (JSON.stringify(this.wallet) === JSON.stringify(wallet)) {
      return
    }

    this.wallet = { ...wallet }
    this.notifyListeners()
  }

  /**
   * Updates only specific fields in the wallet state (shallow merge).
   * Notifies all subscribers exactly once if any field changed.
   * Useful for incremental updates like marking wallet as connecting.
   */
  updateWallet(partial: Partial<WalletState>): void {
    const newWallet = { ...this.wallet, ...partial }

    if (JSON.stringify(this.wallet) === JSON.stringify(newWallet)) {
      return
    }

    this.wallet = newWallet
    this.notifyListeners()
  }

  /**
   * Internal helper to notify all listeners once.
   * Called after any state change.
   */
  private notifyListeners(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

/**
 * Factory function to create a new StellarRuntime with the given options.
 *
 * @param options Configuration options for the runtime.
 * @returns A new StellarRuntime instance.
 * @throws {Error} If network configuration validation fails.
 *
 * @example
 * ```typescript
 * const runtime = createStellarRuntime({
 *   network: "mainnet",
 *   queryConfig: { staleTime: 60000, gcTime: 600000 }
 * });
 *
 * // Get current state
 * const snapshot = runtime.getSnapshot();
 *
 * // Subscribe to changes
 * const unsubscribe = runtime.subscribe((snapshot) => {
 *   console.log("Network changed to:", snapshot.network);
 * });
 *
 * // Update network
 * runtime.setNetwork("testnet");
 *
 * // Cleanup
 * unsubscribe();
 * ```
 */
export function createStellarRuntime(options?: CreateStellarRuntimeOptions): StellarRuntime {
  return new StellarRuntime(options)
}
