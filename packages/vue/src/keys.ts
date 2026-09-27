import { InjectionKey } from "vue"
import type { StellarRuntimeValue } from "./plugin"

/**
 * Vue injection key for the Stellar runtime.
 *
 * Composables use this key to inject the shared runtime instance,
 * which is provided by the createStellarPlugin at application scope.
 *
 * @example
 * ```ts
 * const runtime = inject(StellarRuntimeKey)
 * ```
 */
export const StellarRuntimeKey = Symbol<StellarRuntimeValue>(
  "stellar-runtime"
) as InjectionKey<StellarRuntimeValue>
