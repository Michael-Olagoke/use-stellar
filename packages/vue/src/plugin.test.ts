import { describe, it, expect, beforeEach } from "vitest"
import { createApp, App, inject } from "vue"
import { createStellarPlugin, StellarRuntimeKey } from "./plugin"

describe("createStellarPlugin", () => {
  let app: App

  beforeEach(() => {
    app = createApp({})
  })

  it("should install the plugin and provide the runtime", () => {
    app.use(createStellarPlugin({ network: "testnet" }))

    let injectedRuntime: any = null
    const TestComponent = {
      setup() {
        injectedRuntime = inject(StellarRuntimeKey)
        return {}
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(injectedRuntime).toBeDefined()
    expect(injectedRuntime.network).toBe("testnet")
    expect(injectedRuntime.networkConfig).toBeDefined()
    expect(injectedRuntime.wallet).toBeDefined()
    expect(injectedRuntime.queryStore).toBeDefined()
  })

  it("should create a runtime with default network (testnet)", () => {
    app.use(createStellarPlugin())

    let injectedRuntime: any = null
    const TestComponent = {
      setup() {
        injectedRuntime = inject(StellarRuntimeKey)
        return {}
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(injectedRuntime.network).toBe("testnet")
    expect(injectedRuntime.networkConfig.horizonUrl).toBe("https://horizon-testnet.stellar.org")
  })

  it("should support custom network configuration", () => {
    const customConfig = {
      horizonUrl: "http://localhost:8000",
      sorobanUrl: "http://localhost:8000/soroban/rpc",
      networkPassphrase: "Standalone Network ; February 2017",
    }

    app.use(
      createStellarPlugin({
        network: "custom",
        networkConfig: customConfig,
      })
    )

    let injectedRuntime: any = null
    const TestComponent = {
      setup() {
        injectedRuntime = inject(StellarRuntimeKey)
        return {}
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(injectedRuntime.networkConfig.horizonUrl).toBe("http://localhost:8000")
    expect(injectedRuntime.networkConfig.sorobanUrl).toBe("http://localhost:8000/soroban/rpc")
    expect(injectedRuntime.networkConfig.networkPassphrase).toBe(
      "Standalone Network ; February 2017"
    )
  })

  it("should throw when custom network is missing networkPassphrase", () => {
    expect(() => {
      app.use(
        createStellarPlugin({
          network: "custom",
          networkConfig: {
            horizonUrl: "http://localhost:8000",
            sorobanUrl: "http://localhost:8000/soroban/rpc",
          },
        })
      )
    }).toThrow("networkPassphrase")
  })

  it("should throw when custom network is missing horizonUrl", () => {
    expect(() => {
      app.use(
        createStellarPlugin({
          network: "custom",
          networkConfig: {
            sorobanUrl: "http://localhost:8000/soroban/rpc",
            networkPassphrase: "Standalone Network ; February 2017",
          },
        })
      )
    }).toThrow("horizonUrl")
  })

  it("should throw when custom network is missing sorobanUrl", () => {
    expect(() => {
      app.use(
        createStellarPlugin({
          network: "custom",
          networkConfig: {
            horizonUrl: "http://localhost:8000",
            networkPassphrase: "Standalone Network ; February 2017",
          },
        })
      )
    }).toThrow("sorobanUrl")
  })

  it("should use provided runtime instead of creating a new one", () => {
    const mockRuntime = {
      network: "mainnet" as const,
      networkConfig: {
        network: "mainnet" as const,
        horizonUrl: "https://custom-horizon.example.com",
        sorobanUrl: "https://custom-soroban.example.com",
        networkPassphrase: "Test Passphrase",
      },
      wallet: { value: { connected: false } } as any,
      setWallet: () => {},
      autoConnect: { enabled: false, persistAddress: false, storage: "local" },
      queryStore: {} as any,
    }

    app.use(createStellarPlugin({ runtime: mockRuntime }))

    let injectedRuntime: any = null
    const TestComponent = {
      setup() {
        injectedRuntime = inject(StellarRuntimeKey)
        return {}
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(injectedRuntime).toBe(mockRuntime)
    expect(injectedRuntime.networkConfig.horizonUrl).toBe("https://custom-horizon.example.com")
  })

  it("should support mainnet configuration", () => {
    app.use(createStellarPlugin({ network: "mainnet" }))

    let injectedRuntime: any = null
    const TestComponent = {
      setup() {
        injectedRuntime = inject(StellarRuntimeKey)
        return {}
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(injectedRuntime.network).toBe("mainnet")
    expect(injectedRuntime.networkConfig.horizonUrl).toBe("https://horizon.stellar.org")
    expect(injectedRuntime.networkConfig.networkPassphrase).toBe(
      "Public Global Stellar Network ; September 2015"
    )
  })

  it("should support futurenet configuration", () => {
    app.use(createStellarPlugin({ network: "futurenet" }))

    let injectedRuntime: any = null
    const TestComponent = {
      setup() {
        injectedRuntime = inject(StellarRuntimeKey)
        return {}
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(injectedRuntime.network).toBe("futurenet")
    expect(injectedRuntime.networkConfig.horizonUrl).toBe(
      "https://horizon-futurenet.stellar.org"
    )
  })

  it("should support queryConfig option", () => {
    const queryConfig = { staleTime: 60000, gcTime: 600000 }

    app.use(createStellarPlugin({ network: "testnet", queryConfig }))

    let injectedRuntime: any = null
    const TestComponent = {
      setup() {
        injectedRuntime = inject(StellarRuntimeKey)
        return {}
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(injectedRuntime.queryStore).toBeDefined()
    // The QueryStore internally stores the config, so we verify it was created
    expect(injectedRuntime.queryStore.size).toBe(0)
  })

  it("should support autoConnect option as boolean", () => {
    app.use(createStellarPlugin({ network: "testnet", autoConnect: true }))

    let injectedRuntime: any = null
    const TestComponent = {
      setup() {
        injectedRuntime = inject(StellarRuntimeKey)
        return {}
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(injectedRuntime.autoConnect.enabled).toBe(true)
    expect(injectedRuntime.autoConnect.persistAddress).toBe(false)
    expect(injectedRuntime.autoConnect.storage).toBe("local")
  })

  it("should support autoConnect option as object", () => {
    app.use(
      createStellarPlugin({
        network: "testnet",
        autoConnect: { enabled: true, persistAddress: true, storage: "session" },
      })
    )

    let injectedRuntime: any = null
    const TestComponent = {
      setup() {
        injectedRuntime = inject(StellarRuntimeKey)
        return {}
      },
      template: "<div></div>",
    }

    app.component("TestComponent", TestComponent)
    const element = document.createElement("div")
    app.mount(element)

    expect(injectedRuntime.autoConnect.enabled).toBe(true)
    expect(injectedRuntime.autoConnect.persistAddress).toBe(true)
    expect(injectedRuntime.autoConnect.storage).toBe("session")
  })
})
