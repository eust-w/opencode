export * as BrowserTunnelProtocol from "./browser-tunnel.js"

export const Path = "/api/experimental/browser/tunnel"
export const Subprotocol = "opencode.browser.tunnel.v1"
export const MaxFrameBytes = 64 * 1_024
export const Header = {
  session: "x-opencode-browser-session",
  lease: "x-opencode-browser-lease",
  host: "x-opencode-browser-host",
  port: "x-opencode-browser-port",
} as const
