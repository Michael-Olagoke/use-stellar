/**
 * @use-stellar/vue - Vue 3 composables for the Stellar network
 *
 * This package provides Vue 3 Composition API composables for interacting
 * with the Stellar network. It builds on the shared runtime from use-stellar/core
 * and adapts it to Vue's provide/inject and reactivity model.
 */

export { createStellarPlugin } from "./plugin"
export type { CreateStellarPluginOptions, StellarRuntimeValue } from "./plugin"
export { StellarRuntimeKey } from "./keys"
export { useStellar } from "./useStellar"
export type { UseStellarReturn } from "./useStellar"
