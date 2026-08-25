import type { Browser } from "@opencode-ai/schema/browser"

export type BrowserPaneEndpoint = Readonly<{ url: string; username?: string; password?: string }>
export type BrowserPaneTarget = Readonly<{ sessionID: string; endpoint: BrowserPaneEndpoint }>
export type BrowserPaneLayout = { visible: boolean; bounds?: { x: number; y: number; width: number; height: number } }

export type BrowserPaneCommand =
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "stop" }

export type BrowserPaneState = Omit<Browser.State, "generation"> & {
  readonly ready: boolean
  readonly error?: string
}
export type BrowserPaneEvent = { type: "open" } | { type: "state"; state: BrowserPaneState }

export type BrowserPaneRegistration = {
  setLayout(layout?: BrowserPaneLayout): void
  command(command: BrowserPaneCommand): Promise<void>
  close(): void
}

export type BrowserPanePlatform = {
  register(target: BrowserPaneTarget, listener: (event: BrowserPaneEvent) => void): BrowserPaneRegistration
}
