import { App, ref, reactive, readonly } from "vue"
import type { Ref } from "vue"
import {
  QueryStore,
  WALLET_SESSION_STORAGE_KEY,
  type StellarNetwork,
  type NetworkConfig,
  type WalletState,
  type CustomNetworkConfig,
  type QueryConfig,
  type AutoConnectOptions,
} from "use-stellar"
import { StellarRuntimeKey } from "./keys"

/**
 * Props accepted by createStellarPlugin.
 * Mirrors the React StellarProvider props to maintain API parity.
 */
export interface CreateStellarPluginOptions {
  /**
   * The Stellar network environment.
   * - Optional: Defaults to "testnet" if omitted or invalid.
   * - Values: "testnet", "mainnet", "futurenet", or "custom"
   * - Impact: Configures Horizon/Soroban RPC endpoints and network passphrase.
   */
  network?: StellarNetwork

  /**
   * Optional override for Horizon and Soroban RPC endpoints, and network passphrase.
   * Both horizonUrl and sorobanUrl are required when provided.
   * networkPassphrase is optional for known networks and required for "custom".
   */
  networkConfig?: CustomNetworkConfig

  /**
   * Cache configuration: staleTime and gcTime in milliseconds.
   * - staleTime (default 30000): How long data is considered fresh
   * - gcTime (default 300000): How long a cache entry survives after unmount
   */
  queryConfig?: QueryConfig

  /**
   * Restores the previous wallet session on mount.
   * Off by default. When enabled, reconnects only if no approval prompt is needed.
   */
  autoConnect?: boolean | AutoConnectOptions

  /**
   * An existing StellarRuntime to use instead of creating a new one.
   * When provided, all other options are ignored. Used for advanced scenarios
   * where a runtime is created externally and injected into Vue.
   */
  runtime?: StellarRuntimeValue
}

/**
 * The Stellar runtime value provided to Vue composables.
 * Reactive state updates notify all subscribed composables.
 */
export interface StellarRuntimeValue {
  /** The configured network ("testnet", "mainnet", "futurenet", or "custom") */
  network: StellarNetwork

  /** Network configuration including Horizon/Soroban URLs and passphrase */
  networkConfig: NetworkConfig

  /** Current wallet connection state (reactive) */
  wallet: Ref<WalletState>

  /** Function to update wallet state */
  setWallet: (update: WalletState | ((prev: WalletState) => WalletState)) => void

  /** Resolved autoconnect options */
  autoConnect: Required<AutoConnectOptions>

  /** Shared query/cache store for deduplication and subscription */
  queryStore: QueryStore
}

/**
 * Default initial state for wallet connection.
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
 * Pre-defined configurations for supported Stellar networks.
 */
const NETWORK_PASSPHRASES: Record<Exclude<StellarNetwork, "custom">, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
  futurenet: "Test SDF Future Network ; October 2022",
}

const NETWORK_CONFIGS: Record<Exclude<StellarNetwork, "custom">, NetworkConfig> = {
  testnet: {
    network: "testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: NETWORK_PASSPHRASES.testnet,
  },
  mainnet: {
    network: "mainnet",
    horizonUrl: "https://horizon.stellar.org",
    sorobanUrl: "https://soroban.stellar.org",
    networkPassphrase: NETWORK_PASSPHRASES.mainnet,
  },
  futurenet: {
    network: "futurenet",
    horizonUrl: "https://horizon-futurenet.stellar.org",
    sorobanUrl: "https://rpc-futurenet.stellar.org",
    networkPassphrase: NETWORK_PASSPHRASES.futurenet,
  },
}

/**
 * Returns the built-in config for a network, or undefined for "custom".
 */
function getBuiltInConfig(network: StellarNetwork): NetworkConfig | undefined {
  return network === "custom" ? undefined : NETWORK_CONFIGS[network]
}

/**
 * Validates and resolves network configuration.
 * Throws descriptive errors if required fields are missing.
 */
function resolveNetworkConfig(
  network: StellarNetwork,
  override: CustomNetworkConfig | undefined
): NetworkConfig {
  const builtIn = getBuiltInConfig(network)

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
 * Normalizes the autoConnect prop into a fully-resolved options object.
 */
function resolveAutoConnect(
  autoConnect: boolean | AutoConnectOptions | undefined
): Required<AutoConnectOptions> {
  const options = typeof autoConnect === "boolean" ? { enabled: autoConnect } : (autoConnect ?? {})

  return {
    enabled: options.enabled ?? false,
    persistAddress: options.persistAddress ?? false,
    storage: options.storage ?? "local",
  }
}

/**
 * Creates a Stellar runtime value object from configuration options.
 * This runtime is then provided to the entire Vue application.
 */
function createStellarRuntime(options: CreateStellarPluginOptions): StellarRuntimeValue {
  const network = options.network ?? "testnet"
  const networkConfig = resolveNetworkConfig(network, options.networkConfig)
  const autoConnect = resolveAutoConnect(options.autoConnect)
  const walletRef = ref<WalletState>(DEFAULT_WALLET)

  const runtime: StellarRuntimeValue = {
    network,
    networkConfig,
    wallet: walletRef,
    setWallet: (update: WalletState | ((prev: WalletState) => WalletState)) => {
      walletRef.value = typeof update === "function" ? update(walletRef.value) : update
    },
    autoConnect,
    queryStore: new QueryStore(options.queryConfig),
  }

  return runtime
}

/**
 * Creates a Vue plugin that provides the Stellar runtime to the application.
 *
 * The plugin can either create a new runtime from options or accept an existing one.
 * It installs exactly one runtime under the StellarRuntimeKey injection key.
 *
 * @example
 * ```ts
 * import { createApp } from 'vue'
 * import { createStellarPlugin } from '@use-stellar/vue'
 * import App from './App.vue'
 *
 * const app = createApp(App)
 * app.use(createStellarPlugin({ network: 'testnet' }))
 * app.mount('#app')
 * ```
 *
 * @param options - Plugin configuration or an existing runtime
 * @returns A Vue plugin ready for installation
 */
export function createStellarPlugin(options: CreateStellarPluginOptions = {}) {
  return {
    install(app: App) {
      // Use provided runtime or create a new one
      const runtime = options.runtime || createStellarRuntime(options)

      // Provide the runtime to all composables in the app
      app.provide(StellarRuntimeKey, runtime)
    },
  }
}
