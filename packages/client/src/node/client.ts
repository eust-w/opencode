import { OpenCode } from "../promise/generated/index.js"
import { createBrowserClient } from "./browser/client.js"

export type ClientOptions = OpenCode.ClientOptions
export type RequestOptions = OpenCode.RequestOptions

export function make(options: ClientOptions) {
  return { ...OpenCode.make(options), browser: createBrowserClient(options) }
}
