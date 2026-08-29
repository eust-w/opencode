import { Button } from "@opencode-ai/ui/button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import type { OpencodeClient, Session, SessionAutoDriveState } from "@opencode-ai/sdk/v2/client"
import { type Accessor, createMemo, createSignal } from "solid-js"
import { useServerSync } from "@/context/server-sync"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"

type AutoDriveUpdate = Parameters<OpencodeClient["v2"]["session"]["autoDrive"]>[0]["sessionAutoDriveUpdate"]
type AutoDriveSession = Session & { autoDrive?: SessionAutoDriveState }

export function createSessionAutoDriveController(sessionID: Accessor<string | undefined>) {
  const sdk = useServerSDK()
  const serverSync = useServerSync()
  const protocol = useServerProtocol()
  const language = useLanguage()
  const [saving, setSaving] = createSignal(false)
  const state = createMemo(() => {
    const id = sessionID()
    if (!id) return
    return (serverSync().session.get(id) as AutoDriveSession | undefined)?.autoDrive
  })
  const available = () => !!sessionID() && protocol() !== "v1"

  const update = async (settings: Omit<AutoDriveUpdate, "sessionID">) => {
    const id = sessionID()
    if (!id || !available()) throw new Error(language.t("autoDrive.error.v2Required"))
    setSaving(true)
    const info = serverSync().session.get(id)
    return sdk()
      .createClient({ directory: info?.directory, throwOnError: true })
      .v2.session.autoDrive({ sessionID: id, sessionAutoDriveUpdate: settings })
      .then((result) => {
        if (!result.data) throw new Error(language.t("prompt.toast.autoDriveUpdateFailed.description"))
        const next = result.data.data
        const current = serverSync().session.get(id)
        if (current) serverSync().session.remember({ ...current, autoDrive: next } as AutoDriveSession)
        return next
      })
      .finally(() => setSaving(false))
  }

  return {
    available,
    enabled: () => state()?.settings.enabled ?? false,
    saving,
    state,
    status: () => {
      if (!available()) return language.t("autoDrive.status.unavailable")
      const current = state()
      if (!current?.status.action)
        return current?.settings.enabled
          ? language.t("autoDrive.status.awaiting")
          : language.t("autoDrive.status.disabled")
      const action = {
        continue: language.t("autoDrive.action.continue"),
        stop: language.t("autoDrive.action.stop"),
        defer: language.t("autoDrive.action.defer"),
      }[current.status.action]
      return language.t("autoDrive.status.decision", {
        action,
        count: current.status.continuationCount,
        max: current.settings.maxRuns,
      })
    },
    report(error: unknown) {
      showToast({
        title: language.t("prompt.toast.autoDriveUpdateFailed.title"),
        description:
          error instanceof Error ? error.message : language.t("prompt.toast.autoDriveUpdateFailed.description"),
      })
    },
    update,
    toggle: () => update({ enabled: !state()?.settings.enabled }),
  }
}

export function AutoDrivePromptControlV2(props: { sessionID: Accessor<string | undefined> }) {
  const control = createSessionAutoDriveController(props.sessionID)
  const language = useLanguage()
  const tooltip = () => {
    const reason = control.state()?.status.reason
    return reason
      ? language.t("autoDrive.tooltip.reason", { status: control.status(), reason })
      : language.t("autoDrive.tooltip", { status: control.status() })
  }

  return (
    <TooltipV2 placement="top" gutter={6} value={tooltip()}>
      <ButtonV2
        variant={control.enabled() ? "neutral" : "ghost-muted"}
        size="normal"
        style={{ height: "28px", padding: "0 8px" }}
        class="min-w-0 justify-start gap-1.5 ![font-weight:440] group cursor-pointer"
        data-action="prompt-auto-drive-toggle"
        disabled={!control.available() || control.saving()}
        onClick={() => void control.toggle().catch(control.report)}
      >
        <span
          class="text-12-medium"
          classList={{ "text-text-primary": control.enabled(), "text-text-weak": !control.enabled() }}
        >
          {language.t("autoDrive.label")}
        </span>
        <span
          class="h-1.5 w-1.5 rounded-full transition-colors"
          classList={{ "bg-icon-success-base": control.enabled(), "bg-icon-subtle": !control.enabled() }}
        />
      </ButtonV2>
    </TooltipV2>
  )
}

export function AutoDrivePromptControl(props: { sessionID: Accessor<string | undefined> }) {
  const control = createSessionAutoDriveController(props.sessionID)
  const language = useLanguage()
  const tooltip = () => {
    const reason = control.state()?.status.reason
    return reason
      ? language.t("autoDrive.tooltip.reason", { status: control.status(), reason })
      : language.t("autoDrive.tooltip", { status: control.status() })
  }

  return (
    <Tooltip placement="top" value={tooltip()}>
      <Button
        type="button"
        variant="ghost"
        size="normal"
        class="gap-1.5 text-13-regular text-text-base"
        data-action="prompt-auto-drive-toggle"
        disabled={!control.available() || control.saving()}
        onClick={() => void control.toggle().catch(control.report)}
      >
        <span>{language.t("autoDrive.label")}</span>
        <span
          class="h-1.5 w-1.5 rounded-full transition-colors"
          classList={{ "bg-icon-success-base": control.enabled(), "bg-icon-subtle": !control.enabled() }}
        />
      </Button>
    </Tooltip>
  )
}
