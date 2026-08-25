export * as BrowserTunnel from "./browser-tunnel.js"

import { Schema } from "effect"

export const Host = Schema.NonEmptyString.check(Schema.isMaxLength(253), Schema.isPattern(/^[^\s/?#]+$/))
  .pipe(Schema.brand("BrowserTunnel.Host"))
  .annotate({ identifier: "BrowserTunnel.Host" })
export type Host = typeof Host.Type

export const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 }))
  .pipe(Schema.brand("BrowserTunnel.Port"))
  .annotate({ identifier: "BrowserTunnel.Port" })
export type Port = typeof Port.Type

export interface Target extends Schema.Schema.Type<typeof Target> {}
export const Target = Schema.Struct({ host: Host, port: Port }).annotate({ identifier: "BrowserTunnel.Target" })
