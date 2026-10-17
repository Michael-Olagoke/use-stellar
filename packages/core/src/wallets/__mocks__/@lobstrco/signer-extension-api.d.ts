declare module "@lobstrco/signer-extension-api" {
  export function isConnected(): Promise<boolean>
  export function getPublicKey(options?: { network?: string }): Promise<string>
  export function getConnectedWallet(options?: { network?: string }): Promise<{
    publicKey: string
    network: string
  } | null>
  export function getSupportedNetworks(): Promise<
    Array<{
      network: string
      displayName: string
      nativeCode: string
      nativeDecimals: number
      explorerAccountUrl: string
      signTypes: string[]
      broadcaster: string
      available: boolean
    }>
  >
  export function supportsNetwork(network: string): Promise<boolean>
  export function signTransaction(
    transaction: string,
    options?: { network?: string }
  ): Promise<string>
  export const NETWORK: {
    stellar?: string
    [key: string]: string | undefined
  }
}
