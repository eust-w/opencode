import { Browser, BrowserDriver, type BrowserDriverContext, type ChromiumPort } from "@opencode-ai/client/node"
import { expect, test } from "bun:test"

const context: BrowserDriverContext = {
  proxy: { url: "http://127.0.0.1:1", host: "127.0.0.1", port: 1, credentials: { username: "u", password: "p" } },
  signal: new AbortController().signal,
}

test("uses bounded root-frame accessibility refs, CDP input, redaction, and document generations", async () => {
  const commands: Array<{ method: string; params?: Record<string, unknown> }> = []
  const listeners = new Set<Parameters<ChromiumPort<string>["subscribe"]>[0]>()
  const current = {
    url: "https://example.com/",
    title: "Example",
    loading: false,
    canGoBack: false,
    canGoForward: false,
  }
  const navigations: string[] = []
  let disposed = 0
  const port: ChromiumPort<string> = {
    resource: "chromium",
    state: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    navigate: async (url) => {
      navigations.push(url)
    },
    back: () => undefined,
    forward: () => undefined,
    reload: () => undefined,
    stop: () => undefined,
    send: async (command) => {
      commands.push(command)
      if (command.method === "DOM.getBoxModel") return { model: { content: [0, 0, 50, 0, 50, 80, 0, 80] } }
      if (command.method !== "Accessibility.getFullAXTree") return {}
      return {
        nodes: [
          { nodeId: "root", frameId: "main", role: { value: "RootWebArea" }, childIds: ["button", "input", "foreign"] },
          { nodeId: "button", backendDOMNodeId: 4, role: { value: "button" }, name: { value: "Save" } },
          {
            nodeId: "input",
            backendDOMNodeId: 5,
            role: { value: "textbox" },
            name: { value: "Password" },
            value: { value: "secret" },
          },
          {
            nodeId: "foreign",
            frameId: "other",
            backendDOMNodeId: 6,
            role: { value: "button" },
            name: { value: "Foreign" },
          },
        ],
      }
    },
    viewport: () => ({ width: 800, height: 600 }),
    screenshot: async () => ({ data: new Uint8Array([1, 2, 3]), width: 800, height: 600 }),
    dispose: () => {
      disposed++
    },
  }
  const instance = await BrowserDriver.chromium(() => port)(context)
  const execute = (command: Browser.Command) => instance.execute(command, { signal: context.signal })
  const snapshot = await execute({ type: "snapshot", generation: 0 })
  if (snapshot.type !== "snapshot") throw new Error("expected browser snapshot")
  expect(snapshot.content).toContain('e1 [button] "Save"')
  expect(snapshot.content).toContain('e2 [textbox] "Password"')
  expect(snapshot.content).not.toContain("secret")
  expect(snapshot.content).not.toContain("Foreign")
  expect(commands[0]).toEqual({ method: "Accessibility.getFullAXTree", params: { depth: 6 } })
  await execute({ type: "click", ref: Browser.Ref.make("e1"), generation: 0 })
  await execute({ type: "fill", ref: Browser.Ref.make("e2"), text: "hello", generation: 0 })
  await execute({ type: "press", key: "Enter", generation: 0 })
  await execute({ type: "scroll", direction: "down", pixels: 300, generation: 0 })
  expect(commands).toContainEqual({ method: "DOM.focus", params: { backendNodeId: 5 } })
  expect(commands).toContainEqual({ method: "Input.insertText", params: { text: "hello" } })
  expect(await execute({ type: "screenshot", generation: 0 })).toMatchObject({ mediaType: "image/png", width: 800 })
  await instance.resource.navigate("localhost:5173")
  await instance.resource.navigate("example.com:5173")
  expect(navigations).toEqual(["http://localhost:5173/", "https://example.com:5173/"])
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "https://user:pass@example.com/"]) {
    await expect(instance.resource.navigate(url)).rejects.toMatchObject({ code: "invalid_url" })
  }
  listeners.forEach((listener) => listener({ state: current, mainDocumentChanged: true }))
  expect(instance.resource.state().generation).toBe(1)
  await expect(execute({ type: "click", ref: Browser.Ref.make("e1"), generation: 1 })).rejects.toMatchObject({
    code: "stale_ref",
  })
  await instance.dispose()
  await instance.dispose()
  expect(disposed).toBe(1)
})
