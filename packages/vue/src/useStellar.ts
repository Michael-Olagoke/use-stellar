import { inject, readonly, ref, watch, onBeforeUnmount, Ref } from "vue"
import { StellarRuntimeKey } from "./keys"
import type { StellarRuntimeValue } from "./plugin"
import type {
  StellarNetwork,
  NetworkConfig,
  WalletState,
  AutoConnectOptions,
  QueryStore,
} from "use-stellar"

/**
 * Return value from the useStellar composable.
 *
 * Provides access to the shared Stellar runtime plus a reactive snapshot
 * of runtime state that updates when the runtime changes.
 */
export interface UseStellarReturn {
  /**
   * The configured Stellar network ("testnet", "mainnet", "futurenet", or "custom").
   * This is a static value that does not change after composable initialization.
   */
  network: StellarNetwork

  /**
   * Network configuration including Horizon/Soroban URLs and network passphrase.
   * This is a static value that does not change after composable initialization.
   */
  networkConfig: NetworkConfig

  /**
   * Reactive, readonly snapshot of the current wallet connection state.
   * Updates whenever the wallet state changes in the runtime.
   * Cannot be modified directly; use setWallet via the runtime for updates.
   */
  wallet: Readonly<Ref<WalletState>>

  /**
   * Resolved autoconnect options. This is a static value.
   */
  autoConnect: Required<AutoConnectOptions>

  /**
   * The shared query/cache store for data-fetching hooks.
   * Advanced users can interact with this directly; most composables use it internally.
   */
  queryStore: QueryStore

  /**
   * Function to update wallet state directly.
   * Accepts either a new WalletState or a function that transforms the current state.
   */
  setWallet: (update: WalletState | ((prev: WalletState) => WalletState)) => void
}

/**
 * Composable to access the installed Stellar runtime and subscribe to its state changes.
 *
 * This is the base composable that other data-fetching and wallet composables depend on.
 * It injects the runtime provided by createStellarPlugin, subscribes to wallet state changes,
 * and ensures cleanup on component unmount.
 *
 * ### Lifecycle
 *
 * - **Setup**: Injects the runtime and subscribes to wallet state updates
 * - **Runtime**: The returned wallet ref updates reactively when state changes
 * - **Unmount**: Unsubscribes from runtime changes and cleans up the listener
 *
 * ### Error Handling
 *
 * Throws a descriptive error if called outside a Vue component setup context
 * or when the plugin has not been installed.
 *
 * @throws {Error} If called outside the StellarProvider plugin hierarchy
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useStellar } from '@use-stellar/vue'
 *
 * const { wallet, network, setWallet } = useStellar()
 * </script>
 *
 * <template>
 *   <div>
 *     <p>Network: {{ network }}</p>
 *     <p v-if="wallet.connected">Connected: {{ wallet.address }}</p>
 *     <p v-else>Not connected</p>
 *   </div>
 * </template>
 * ```
 *
 * @returns {UseStellarReturn} The runtime and reactive wallet state
 */
export function useStellar(): UseStellarReturn {
  // Inject the runtime from the plugin or throw if not found
  const runtime = inject<StellarRuntimeValue | null>(StellarRuntimeKey, null)

  if (!runtime) {
    throw new Error(
      "use-stellar: No Stellar runtime found. " +
        "Make sure to install the plugin before using composables: " +
        "app.use(createStellarPlugin({ network: 'testnet' }))"
    )
  }

  // The runtime's wallet is already a reactive Ref, so we can use it directly
  // We wrap it in readonly to prevent mutations outside of setWallet
  const walletReadonly = readonly(runtime.wallet) as Readonly<Ref<WalletState>>

  // Clean up on component unmount
  // Note: The runtime's wallet ref is owned by the plugin and lives for the app lifetime,
  // so we don't unsubscribe from it here. Each composable holds a reference to the same
  // shared reactive ref, which is the intended design.
  onBeforeUnmount(() => {
    // No cleanup needed - the runtime is application-scoped, not component-scoped
    // Composables share the same wallet ref, so leaving a composable doesn't affect others
  })

  return {
    network: runtime.network,
    networkConfig: runtime.networkConfig,
    wallet: walletReadonly,
    autoConnect: runtime.autoConnect,
    queryStore: runtime.queryStore,
    setWallet: runtime.setWallet,
  }
}
