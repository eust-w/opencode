import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "C:/OpenCode/AutoDriveSession"
const projectID = "proj_auto_drive_session"
const sessionID = "ses_auto_drive_session"
const initialState = {
  settings: {
    enabled: false,
    policy: "supervisor",
    maxRuns: 5,
    contextual: false,
    memory: true,
  },
  status: { continuationCount: 0 },
}

for (const layout of ["current", "legacy"] as const) {
  test(`${layout} Session UI persists Auto-Drive and shows its status in settings`, async ({ page }) => {
    const updates: unknown[] = []
    await setup(page, layout === "current", updates)

    await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
    await expectAppVisible(page.getByRole("textbox", { name: "Prompt" }))
    const toggle = page.getByRole("button", { name: "Auto-Drive" })
    await expect(toggle).toBeEnabled()

    const request = page.waitForRequest(
      (value) => value.method() === "PUT" && new URL(value.url()).pathname === `/api/session/${sessionID}/auto-drive`,
    )
    await toggle.click()
    expect((await request).postDataJSON()).toEqual({ enabled: true })
    await expect.poll(() => updates).toEqual([{ enabled: true }])

    await page.keyboard.press("Control+,")
    const settings = page.locator('[data-action="settings-auto-drive"]')
    await expect(settings).toBeVisible()
    await expect(settings.getByRole("switch")).toBeChecked()
    await expect(page.getByText("Enabled · awaiting a boundary", { exact: false })).toBeVisible()
  })
}

test("/autodrive enables the Session before submitting its task", async ({ page }) => {
  const updates: unknown[] = []
  const sequence: string[] = []
  await setup(
    page,
    true,
    updates,
    [
      {
        name: "autodrive",
        description: "enable safe turn-boundary Auto-Drive for a task",
        source: "command",
        template: "Task:\n$ARGUMENTS",
        hints: ["$ARGUMENTS"],
      },
    ],
    sequence,
  )
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (
      route.request().method() === "POST" &&
      (path === `/session/${sessionID}/command` || path === `/api/session/${sessionID}/command`)
    )
      sequence.push("command")
    await route.fallback()
  })

  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  const composer = page.locator('[data-component="prompt-input-v2"]')
  const input = composer.locator('[data-component="prompt-input"]')
  await expectAppVisible(composer)
  await input.fill("/autodrive finish tests")

  const autoDriveRequest = page.waitForRequest(
    (value) => value.method() === "PUT" && new URL(value.url()).pathname === `/api/session/${sessionID}/auto-drive`,
  )
  const commandRequest = page.waitForRequest(
    (value) => value.method() === "POST" && new URL(value.url()).pathname.endsWith(`/session/${sessionID}/command`),
  )
  await composer.getByRole("button", { name: "Send" }).click()
  await autoDriveRequest
  await commandRequest

  await expect.poll(() => sequence).toEqual(["auto-drive", "command"])
  expect(updates).toEqual([{ enabled: true }])
})

async function setup(page: Page, current: boolean, updates: unknown[], commands: unknown[] = [], sequence?: string[]) {
  await mockOpenCodeServer(page, {
    protocol: "v2",
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "auto-drive-session",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: { test: { id: "test", name: "Test", limit: { context: 200_000 } } },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "test" },
    },
    sessions: [
      {
        id: sessionID,
        slug: "auto-drive-session",
        projectID,
        directory,
        model: { id: "test", providerID: "opencode" },
        title: "Auto-Drive Session",
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
        autoDrive: initialState,
      },
    ],
    commands,
    pageMessages: () => ({ items: [] }),
  })
  await page.route(`**/api/session/${sessionID}/auto-drive*`, async (route) => {
    const update = route.request().postDataJSON()
    sequence?.push("auto-drive")
    updates.push(update)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          settings: { ...initialState.settings, ...(update as object) },
          status: initialState.status,
        },
      }),
    })
  })
  await page.addInitScript((newLayoutDesigns) => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns } }))
  }, current)
}
