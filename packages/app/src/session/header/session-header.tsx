import { createMemo } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import { useSettings } from "@/settings/model"
import { useSessionLayout } from "@/session/session-layout"
import { reviewTooltipKeybind } from "@/shell/commands/tooltip-keybind"
import { StatusPopover } from "@/shell/status/status-popover"
import { TitlebarRight } from "@/shell/titlebar/right-slot"
import type { createSessionBrowser } from "../browser/model"
import { SessionHeaderActions, type SessionHeaderActionsState } from "./session-header-actions"

export function SessionHeader(props: { browser: ReturnType<typeof createSessionBrowser> }) {
  const command = useCommand()
  const language = useLanguage()
  const settings = useSettings()
  const { view } = useSessionLayout()

  const status = settings.visibility.status
  const isDesktop = createMediaQuery("(min-width: 768px)")

  const actions = createMemo<SessionHeaderActionsState>(() => ({
    status: status() ? { label: language.t("status.popover.trigger"), content: () => <StatusPopover /> } : undefined,
    reviewLabel: language.t("command.review.toggle"),
    reviewKeybind: reviewTooltipKeybind(command),
    reviewVisible: isDesktop(),
    reviewOpened: view().reviewPanel.opened(),
    onReviewToggle: () => view().reviewPanel.toggle(),
    browser: props.browser.available()
      ? { label: language.t("command.browser.toggle"), opened: props.browser.opened(), onToggle: props.browser.toggle }
      : undefined,
  }))

  return (
    <TitlebarRight>
      <SessionHeaderActions state={actions()} />
    </TitlebarRight>
  )
}
