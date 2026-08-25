import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { BrowserControlProtocol } from "../browser-control.js"
import { BrowserTunnelProtocol } from "../browser-tunnel.js"

export const BrowserGroup = HttpApiGroup.make("server.browser")
  .add(HttpApiEndpoint.get("browser.control.connect", BrowserControlProtocol.Path, { success: Schema.Boolean }))
  .add(HttpApiEndpoint.get("browser.tunnel.connect", BrowserTunnelProtocol.Path, { success: Schema.Boolean }))
  .annotate(OpenApi.Exclude, true)
