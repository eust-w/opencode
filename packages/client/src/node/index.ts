import type { make } from "./client.js"

export * from "../promise/index.js"
export * as OpenCode from "./client.js"
export { Browser } from "@opencode-ai/schema/browser"
export { BrowserDriver, BrowserDriverError } from "./browser/driver.js"
export type {
  BrowserDriverContext,
  BrowserDriverFactory,
  BrowserDriverInstance,
  BrowserProxy,
} from "./browser/driver.js"
export type { ChromiumController, ChromiumDriver, ChromiumPort } from "./browser/chromium.js"
export type {
  BrowserAttachment,
  BrowserAttachOptions,
  BrowserClient,
  BrowserRegistration,
  BrowserRegisterOptions,
} from "./browser/client.js"
export type OpenCodeClient = ReturnType<typeof make>
