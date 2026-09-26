import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type {
  AutoConnectOptions,
  CustomNetworkConfig,
  NetworkConfig,
  StellarContextValue,
  StellarNetwork,
  WalletState,
} from "../types"
import { NETWORK_CONFIGS } from "../types"
import { QueryStore } from "../cache"
import type { QueryConfig } from "../cache"
import { createStellarRuntime } from "../runtime"
import type { StellarRuntime, StellarRuntimeSnapshot } from "../runtime"

export type { AutoConnectOptions, QueryConfig }

/**
 * The default initial state for a wallet connection in the Stellar context.
 *
 * - `connected`: false (no wallet has established a connection yet)
 * - `connecting`: false (no active connection request is in progress)
 * - `address`: null (no public key address is available)
 * - `network`: null (no context network associated with the wallet yet)
 * - `wallet`: null (no wallet provider selected)
 * - `walletName`: null (no friendly name for the wallet provider)
 * - `error`: null (no connection-related errors have occurred)
 * - `walletNetwork`: null (no network detected from the wallet browser extension itself)
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

/** Storage key holding the persisted wallet session. */
export const WALLET_SESSION_STORAGE_KEY = "use-stellar:wallet-session"

/**
 * React Context object that holds the Stellar context value or null.
 * Primarily consumed via the `useStellarContext` helper.
 */
const StellarContext = createContext<StellarContextValue | null>(null)

// ── Provider ───────────────────────────────────────────────────────────────
/**
 * Props accepted by the `StellarProvider` component.
 */
export interface StellarProviderProps {
  /**
   * The Stellar network environment.
   *
   * - **Optional**: If omitted or invalid, it defaults to `"testnet"`.
   * - **Values**: `"testnet"`, `"mainnet"`, and `"futurenet"` are pre-configured with SDF
   *             Horizon/Soroban RPC endpoints and the matching network passphrase.
   *             `"custom"` ships no defaults — supply `networkConfig` with all three fields.
   * - **Impact**: Configures Horizon and Soroban RPC URL endpoints via `NETWORK_CONFIGS`, and
   *             resolves the network passphrase every transaction is signed against, for all
   *             downstream hooks.
   */
  network?: StellarNetwork
  /**
   * Optional override for Horizon and Soroban RPC endpoints, and for the
   * network passphrase. When omitted, the built-in SDF endpoints are used.
   *
   * Both `horizonUrl` and `sorobanUrl` are required when this prop is provided.
   * `networkPassphrase` is optional for a known network and required when
   * `network="custom"` — a custom network with no passphrase throws at render.
   *
   * @example
   * // Custom private node on a known network:
   * <StellarProvider
   *   network="mainnet"
   *   networkConfig={{
   *     horizonUrl: "https://horizon.my-node.com",
   *     sorobanUrl: "https://rpc.my-node.com",
   *   }}
   * />
   *
   * @example
   * // A local standalone container:
   * <StellarProvider
   *   network="custom"
   *   networkConfig={{
   *     horizonUrl: "http://localhost:8000",
   *     sorobanUrl: "http://localhost:8000/soroban/rpc",
   *     networkPassphrase: "Standalone Network ; February 2017",
   *   }}
   * />
   */
  networkConfig?: CustomNetworkConfig
  /**
   * Cache configuration: `staleTime` and `gcTime`, both in milliseconds.
   *
   * - **staleTime** (default 30 000): How long fetched data is considered
   *   fresh. Within this window a re-mount serves from cache with no network
   *   request.
   * - **gcTime** (default 300 000): How long a cache entry is kept after all
   *   hook instances that use it have unmounted. Set to 0 to evict immediately.
   *
   * Both can be overridden per hook call.
   *
   * @example
   * <StellarProvider queryConfig={{ staleTime: 60_000, gcTime: 600_000 }}>
   */
  queryConfig?: QueryConfig
  /**
   * Restores the previous wallet session on mount.
   *
   * **Off by default.** When enabled, `useWallet` reconnects only if the
   * wallet can do so without a fresh approval prompt. If a prompt would be
   * required it restores intent instead — the wallet is pre-selected, but the
   * user still clicks Connect. An autoconnect that pops an approval dialog on
   * every page load is worse than no autoconnect.
   *
   * @example
   * <StellarProvider autoConnect>
   * <StellarProvider autoConnect={{ enabled: true, persistAddress: true }}>
   */
  autoConnect?: boolean | AutoConnectOptions
  /**
   * The React component tree to be wrapped by the provider.
   *
   * - **Required**: Must contain React components that will consume the Stellar context.
   * - **Omission**: If omitted, it will cause build-time TypeScript errors or render an empty provider.
   */
  children: ReactNode
}

/** Normalises the `autoConnect` prop into a fully-resolved options object. */
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
 * StellarProvider wraps your React application to manage the active Stellar network configuration
 * and wallet connection states. It serves as the single source of truth for the SDK/wallet contexts.
 *
 * ### Architecture:
 * Under the hood, StellarProvider owns a stable {@link StellarRuntime} instance that manages
 * framework-neutral state (network config, wallet, QueryStore). React hooks into this runtime
 * via useEffect to sync its state to React's useState, ensuring all downstream hooks access
 * the same snapshot and respond to updates in lockstep.
 *
 * ### Lifecycle and Resource Management:
 * - **On Mount**: Initializes the internal `runtime` instance once per provider mount.
 *   It does not make any network requests, open WebSocket connections, setup timers, or add
 *   window event listeners upon initial mounting. This makes the provider lightweight, fast
 *   to mount, and fully server-side rendering (SSR) safe.
 * - **At Runtime**:
 *   - The `network` prop can change dynamically if updated by the parent component. When the
 *     `network` prop changes, the runtime updates its network config instantly, notifying all
 *     downstream subscribers and re-rendering React consumers.
 *   - The `wallet` state is dynamically managed via the returned `setWallet` function when a
 *     wallet adapter (e.g. Freighter, LOBSTR) connects, disconnects, or updates network profiles.
 * - **On Unmount**: No cleanup is needed — all subscribers are unregistered and resources are freed.
 *
 * @example
 * ```tsx
 * <App>
 *   <StellarProvider>
 *     <YourApplication />
 *   </StellarProvider>
 * </App>
 * ```
 */
export function StellarProvider({
  network = "testnet",
  networkConfig: networkConfigOverride,
  queryConfig,
  autoConnect,
  children,
}: StellarProviderProps) {
  // Create the runtime once per provider mount. Using useRef ensures it is never recreated
  // even if the component re-renders, which would lose all cached data.
  const runtimeRef = useRef<StellarRuntime | null>(null)
  if (!runtimeRef.current) {
    runtimeRef.current = createStellarRuntime({
      network,
      networkConfig: networkConfigOverride,
      queryConfig,
    })
  }

  const runtime = runtimeRef.current

  // Sync the provider's props to the runtime.
  // When network or networkConfig props change, update the runtime accordingly.
  useEffect(() => {
    runtime.setNetwork(network, networkConfigOverride)
  }, [runtime, network, networkConfigOverride])

  // React state that mirrors the runtime snapshot.
  // Hooks subscribe to the runtime and update this state whenever the runtime changes,
  // triggering React re-renders.
  const [snapshot, setSnapshot] = useState<StellarRuntimeSnapshot>(() => runtime.getSnapshot())

  // Subscribe to runtime changes and sync to React state.
  useEffect(() => {
    const unsubscribe = runtime.subscribe((newSnapshot) => {
      setSnapshot(newSnapshot)
    })

    return unsubscribe
  }, [runtime])

  // Derived from the same fields `resolveAutoConnect` reads rather than from
  // the prop object, because callers routinely pass `autoConnect={{ ... }}`
  // inline and its identity changes on every parent render.
  const autoConnectOptions = typeof autoConnect === "boolean" ? undefined : autoConnect
  const autoConnectEnabled =
    typeof autoConnect === "boolean" ? autoConnect : autoConnectOptions?.enabled
  const autoConnectPersistAddress = autoConnectOptions?.persistAddress
  const autoConnectStorage = autoConnectOptions?.storage

  const resolvedAutoConnect = useMemo(
    () => resolveAutoConnect(autoConnect),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoConnectEnabled, autoConnectPersistAddress, autoConnectStorage]
  )

  // Memoized context value. A fresh object literal here is a new context value on every
  // provider render, which re-renders every consumer in the tree — including ones whose
  // own inputs did not change.
  const value: StellarContextValue = useMemo(
    () => ({
      network: snapshot.network,
      networkConfig: snapshot.networkConfig,
      wallet: snapshot.wallet,
      setWallet: (walletOrUpdater) => {
        const newWallet = typeof walletOrUpdater === "function" ? walletOrUpdater(snapshot.wallet) : walletOrUpdater
        runtime.setWallet(newWallet)
      },
      autoConnect: resolvedAutoConnect,
      queryStore: snapshot.queryStore,
    }),
    [snapshot, runtime, resolvedAutoConnect]
  )

  return <StellarContext.Provider value={value}>{children}</StellarContext.Provider>
}

/**
 * Custom hook to consume the Stellar provider context values.
 *
 * @throws {Error} If called outside of a `<StellarProvider>` context hierarchy.
 * @returns {StellarContextValue} The active network, network config, wallet state, and state setter.
 */
export function useStellarContext(): StellarContextValue {
  const ctx = useContext(StellarContext)
  if (!ctx) {
    throw new Error(
      "use-stellar: No StellarProvider found. " +
        "Wrap your app in <StellarProvider> before using any use-stellar hooks."
    )
  }
  return ctx
}
