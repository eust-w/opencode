import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

const text = (maximum: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(maximum))
const bindingID = text(128)
const endpoint = Schema.Struct({
  url: text(16_384),
  username: Schema.optionalKey(text(1_024)),
  password: Schema.optionalKey(text(4_096)),
})
const target = Schema.Struct({ sessionID: text(256).check(Schema.isStartsWith("ses")), endpoint })
const bounds = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, width: Schema.Finite, height: Schema.Finite })
const layout = Schema.Struct({ visible: Schema.Boolean, bounds: Schema.optionalKey(bounds) })
const command = Schema.Union([
  Schema.Struct({ type: Schema.Literal("navigate"), url: text(16_384) }),
  Schema.Struct({ type: Schema.Literals(["back", "forward", "reload", "stop"]) }),
])
export const BrowserPaneRequestSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal("register"), bindingID, target }),
  Schema.Struct({ type: Schema.Literal("layout"), bindingID, layout: Schema.optionalKey(layout) }),
  Schema.Struct({ type: Schema.Literal("command"), bindingID, command }),
  Schema.Struct({ type: Schema.Literal("close"), bindingID }),
])
export type BrowserPaneRequest = Schema.Schema.Type<typeof BrowserPaneRequestSchema>

const state = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  loading: Schema.Boolean,
  canGoBack: Schema.Boolean,
  canGoForward: Schema.Boolean,
  ready: Schema.Boolean,
  error: Schema.optionalKey(Schema.String),
})
export const BrowserPaneEventSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal("open") }),
  Schema.Struct({ type: Schema.Literal("state"), state }),
])
export const BrowserPaneRpc = Rpc.make("BrowserPane", { payload: { request: BrowserPaneRequestSchema } })
