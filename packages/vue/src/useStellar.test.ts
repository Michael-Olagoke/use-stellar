import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createApp, App, inject, Ref } from "vue"
import { useStellar } from "./useStellar"
import { createStellarPlugin } from "./plugin"
import { StellarRuntimeKey } from "./keys"
import type { WalletState } from "use-stellar"

describe("useStellar composable", () => {
  let app: App

  beforeEach(() => {
    app = createApp({})
  })

  afterEach(() => {
    // Clean up app
  })

  it("should inject the runtime and return all properties", () => {
    app.use(createStellarPlugin({ network: "testnet" }))

    let returnValue: any = null

    const TestComponent = {
      setup() {
        returnValue = useStellar()
        return { returnValue }
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(returnValue).toBeDefined()
    expect(returnValue.network).toBe("testnet")
    expect(returnValue.networkConfig).toBeDefined()
    expect(returnValue.wallet).toBeDefined()
    expect(returnValue.setWallet).toBeInstanceOf(Function)
    expect(returnValue.autoConnect).toBeDefined()
    expect(returnValue.queryStore).toBeDefined()
  })

  it("should throw when used without the plugin", () => {
    // App without plugin installation
    const TestComponent = {
      setup() {
        return useStellar()
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)

    expect(() => {
      const element = document.createElement("div")
      app.mount(element)
    }).toThrow("No Stellar runtime found")
  })

  it("should throw with an actionable error message", () => {
    const TestComponent = {
      setup() {
        try {
          useStellar()
        } catch (error) {
          expect((error as Error).message).toContain("app.use(createStellarPlugin")
          throw error
        }
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)

    expect(() => {
      const element = document.createElement("div")
      app.mount(element)
    }).toThrow("app.use(createStellarPlugin")
  })

  it("should return readonly wallet state", () => {
    app.use(createStellarPlugin({ network: "testnet" }))

    let walletRef: Ref<WalletState> | null = null

    const TestComponent = {
      setup() {
        const { wallet } = useStellar()
        walletRef = wallet as unknown as Ref<WalletState>
        return { wallet }
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(walletRef).toBeDefined()
    expect(walletRef!.value).toBeDefined()
    expect(walletRef!.value.connected).toBe(false)

    // Verify it's readonly by attempting to assign to the ref itself
    // (this would fail in strict mode or TypeScript)
    expect(() => {
      // @ts-expect-error - wallet should be readonly
      walletRef.value = { connected: true } as WalletState
    }).toThrow() // Vue enforces readonly
  })

  it("should reflect runtime wallet state changes", async () => {
    app.use(createStellarPlugin({ network: "testnet" }))

    let stellarReturn: any = null
    let runtime: any = null

    const TestComponent = {
      setup() {
        runtime = inject(StellarRuntimeKey)
        stellarReturn = useStellar()
        return { stellarReturn, runtime }
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(stellarReturn.wallet.value.connected).toBe(false)

    // Update the runtime wallet state
    const newWalletState: WalletState = {
      connected: true,
      connecting: false,
      address: "GBBD47UZQ2YNRBAXY37H5IM5CYCVOCHOA7WMLBTMDJLLAW7ZRVGIA7GAW",
      network: "testnet",
      wallet: "freighter",
      walletName: "Freighter",
      error: null,
      walletNetwork: "testnet",
      walletNetworkPassphrase: "Test SDF Network ; September 2015",
    }

    runtime.setWallet(newWalletState)

    // Give Vue time to update reactivity
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The composable's wallet state should now reflect the update
    expect(stellarReturn.wallet.value.connected).toBe(true)
    expect(stellarReturn.wallet.value.address).toBe(
      "GBBD47UZQ2YNRBAXY37H5IM5CYCVOCHOA7WMLBTMDJLLAW7ZRVGIA7GAW"
    )
  })

  it("should return the same runtime for multiple composables", () => {
    app.use(createStellarPlugin({ network: "testnet" }))

    let return1: any = null
    let return2: any = null

    const TestComponent = {
      setup() {
        return1 = useStellar()
        return2 = useStellar()
        return { return1, return2 }
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    // Both should share the same runtime instance
    expect(return1.queryStore).toBe(return2.queryStore)
    expect(return1.wallet).toBe(return2.wallet)
  })

  it("should support updating wallet via setWallet", async () => {
    app.use(createStellarPlugin({ network: "testnet" }))

    let stellarReturn: any = null

    const TestComponent = {
      setup() {
        stellarReturn = useStellar()
        return { stellarReturn }
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(stellarReturn.wallet.value.connected).toBe(false)

    const newWallet: WalletState = {
      connected: true,
      connecting: false,
      address: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBZQ5XVVLBX3XVZLHXPYXF",
      network: "testnet",
      wallet: "lobstr",
      walletName: "LOBSTR",
      error: null,
      walletNetwork: "testnet",
      walletNetworkPassphrase: "Test SDF Network ; September 2015",
    }

    stellarReturn.setWallet(newWallet)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(stellarReturn.wallet.value.connected).toBe(true)
    expect(stellarReturn.wallet.value.wallet).toBe("lobstr")
  })

  it("should support updating wallet via updater function", async () => {
    app.use(createStellarPlugin({ network: "testnet" }))

    let stellarReturn: any = null

    const TestComponent = {
      setup() {
        stellarReturn = useStellar()
        // Pre-set initial wallet state
        stellarReturn.setWallet({
          connected: false,
          connecting: false,
          address: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBZQ5XVVLBX3XVZLHXPYXF",
          network: "testnet",
          wallet: "freighter",
          walletName: "Freighter",
          error: null,
          walletNetwork: "testnet",
          walletNetworkPassphrase: "Test SDF Network ; September 2015",
        })
        return { stellarReturn }
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    // Update using function
    stellarReturn.setWallet((prev: WalletState) => ({
      ...prev,
      connected: true,
      connecting: false,
    }))

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(stellarReturn.wallet.value.connected).toBe(true)
    expect(stellarReturn.wallet.value.address).toBe(
      "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBZQ5XVVLBX3XVZLHXPYXF"
    )
  })

  it("should return correct network configuration from runtime", () => {
    app.use(createStellarPlugin({ network: "mainnet" }))

    let stellarReturn: any = null

    const TestComponent = {
      setup() {
        stellarReturn = useStellar()
        return { stellarReturn }
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(stellarReturn.networkConfig.network).toBe("mainnet")
    expect(stellarReturn.networkConfig.horizonUrl).toBe("https://horizon.stellar.org")
    expect(stellarReturn.networkConfig.sorobanUrl).toBe("https://soroban.stellar.org")
  })

  it("should return autoConnect configuration from runtime", () => {
    app.use(
      createStellarPlugin({
        network: "testnet",
        autoConnect: { enabled: true, persistAddress: true, storage: "session" },
      })
    )

    let stellarReturn: any = null

    const TestComponent = {
      setup() {
        stellarReturn = useStellar()
        return { stellarReturn }
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(stellarReturn.autoConnect.enabled).toBe(true)
    expect(stellarReturn.autoConnect.persistAddress).toBe(true)
    expect(stellarReturn.autoConnect.storage).toBe("session")
  })

  it("should provide access to queryStore for advanced usage", () => {
    app.use(createStellarPlugin({ network: "testnet" }))

    let stellarReturn: any = null

    const TestComponent = {
      setup() {
        stellarReturn = useStellar()
        return { stellarReturn }
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(stellarReturn.queryStore).toBeDefined()
    expect(stellarReturn.queryStore.size).toBe(0)
    expect(typeof stellarReturn.queryStore.subscribe).toBe("function")
  })

  it("should work in multiple components independently", () => {
    app.use(createStellarPlugin({ network: "testnet" }))

    let return1: any = null
    let return2: any = null

    const Component1 = {
      setup() {
        return1 = useStellar()
        return { return1 }
      },
      template: "<div></div>",
    }

    const Component2 = {
      setup() {
        return2 = useStellar()
        return { return2 }
      },
      template: "<div></div>",
    }

    app.component("Component1", Component1)
    app.component("Component2", Component2)

    const root = {
      template: "<Component1 /><Component2 />",
    }

    const element = document.createElement("div")
    app.mount(root as any, element)

    // Both components should have access to the same runtime
    expect(return1.network).toBe(return2.network)
    expect(return1.queryStore).toBe(return2.queryStore)
  })

  it("should support different network configurations per app instance", () => {
    // This test verifies that multiple app instances can have different networks
    const app1 = createApp({})
    const app2 = createApp({})

    app1.use(createStellarPlugin({ network: "testnet" }))
    app2.use(createStellarPlugin({ network: "mainnet" }))

    let return1: any = null
    let return2: any = null

    const TestComponent1 = {
      setup() {
        return1 = useStellar()
        return { return1 }
      },
      template: "<div></div>",
    }

    const TestComponent2 = {
      setup() {
        return2 = useStellar()
        return { return2 }
      },
      template: "<div></div>",
    }

    app1.component("Test", TestComponent1)
    app2.component("Test", TestComponent2)

    const elem1 = document.createElement("div")
    const elem2 = document.createElement("div")

    app1.mount(TestComponent1, elem1)
    app2.mount(TestComponent2, elem2)

    expect(return1.network).toBe("testnet")
    expect(return2.network).toBe("mainnet")
  })
})
