export * as SessionAutoDriveController from "./auto-drive-controller"

import { Context, DateTime, Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { Config } from "../config"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { AutoDrive } from "./auto-drive"
import { SessionAutoDrive } from "./auto-drive-state"
import { SessionEvent } from "./event"
import { SessionInput } from "./input"
import { SessionMessage } from "./message"
import { Prompt } from "./prompt"
import { SessionSchema } from "./schema"
import { SessionTable } from "./sql"

export interface RecordInput {
  readonly sessionID: SessionSchema.ID
  readonly action: SessionAutoDrive.Action
  readonly reason?: string
  readonly nextPrompt?: string
  readonly updateMemory?: string
  readonly chainID: string
  readonly inputID?: SessionMessage.ID
}

export interface Interface {
  readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<SessionAutoDrive.State>
  readonly update: (
    sessionID: SessionSchema.ID,
    input: SessionAutoDrive.Update,
  ) => Effect.Effect<SessionAutoDrive.State>
  readonly record: (input: RecordInput) => Effect.Effect<SessionAutoDrive.State>
  readonly reconcile: (sessionID: SessionSchema.ID) => Effect.Effect<SessionInput.Admitted | undefined>
  readonly decide: (input: RecordInput) => Effect.Effect<SessionAutoDrive.State>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionAutoDriveController") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const events = yield* EventV2.Service
    const config = yield* Config.Service

    const get = Effect.fn("SessionAutoDriveController.get")(function* (sessionID: SessionSchema.ID) {
      const row = yield* db
        .select({ state: SessionTable.auto_drive })
        .from(SessionTable)
        .where(eq(SessionTable.id, sessionID))
        .get()
        .pipe(Effect.orDie)
      const configured = Config.latest(yield* config.entries(), "auto_drive")
      return SessionAutoDrive.resolve(configured, row?.state ?? undefined)
    })

    const publish = Effect.fn("SessionAutoDriveController.publish")(function* (
      definition: typeof SessionEvent.AutoDrive.Updated | typeof SessionEvent.AutoDrive.Decided,
      sessionID: SessionSchema.ID,
      state: SessionAutoDrive.State,
    ) {
      yield* events.publish(definition, { sessionID, timestamp: yield* DateTime.now, state })
      return state
    })

    const update = Effect.fn("SessionAutoDriveController.update")(function* (
      sessionID: SessionSchema.ID,
      input: SessionAutoDrive.Update,
    ) {
      const current = yield* get(sessionID)
      return yield* publish(
        SessionEvent.AutoDrive.Updated,
        sessionID,
        SessionAutoDrive.State.make({
          ...current,
          settings: { ...current.settings, ...input },
          status: { continuationCount: 0 },
        }),
      )
    })

    const record = Effect.fn("SessionAutoDriveController.record")(function* (input: RecordInput) {
      const current = yield* get(input.sessionID)
      if (input.inputID && current.status.inputID === input.inputID) return current
      const sameChain = current.status.chainID === input.chainID
      const continuationCount = sameChain ? current.status.continuationCount : 0
      const atLimit = input.action === "continue" && continuationCount >= current.settings.maxRuns
      const action = atLimit ? "stop" : input.action
      const inputID = action === "continue" ? (input.inputID ?? SessionMessage.ID.create()) : undefined
      const nextPrompt = action === "continue" ? (input.nextPrompt ?? AutoDrive.DEFAULT_PROMPT) : undefined
      return yield* publish(
        SessionEvent.AutoDrive.Decided,
        input.sessionID,
        SessionAutoDrive.State.make({
          settings: current.settings,
          status: {
            action,
            reason: atLimit ? "Maximum continuation count reached" : input.reason,
            chainID: input.chainID,
            continuationCount: action === "continue" ? continuationCount + 1 : continuationCount,
            inputID,
            nextPrompt,
          },
          memory: current.settings.memory ? (input.updateMemory ?? current.memory) : undefined,
        }),
      )
    })

    const reconcile = Effect.fn("SessionAutoDriveController.reconcile")(function* (sessionID: SessionSchema.ID) {
      const state = yield* get(sessionID)
      if (state.status.action !== "continue") return
      if (!state.status.inputID || !state.status.nextPrompt || !state.status.chainID) return
      const expected = {
        id: state.status.inputID,
        sessionID,
        prompt: Prompt.make({ text: state.status.nextPrompt }),
        delivery: "queue" as const,
        source: SessionAutoDrive.Source.make({
          type: "auto-drive",
          chainID: state.status.chainID,
          decision: "continue",
          continuation: state.status.continuationCount,
        }),
      }
      const admitted = yield* SessionInput.admit(db, events, expected)
      if (!SessionInput.equivalent(admitted, expected))
        return yield* Effect.die(new SessionInput.LifecycleConflict({ id: expected.id }))
      return admitted
    })

    const decide = Effect.fn("SessionAutoDriveController.decide")(function* (input: RecordInput) {
      const state = yield* record(input)
      yield* reconcile(input.sessionID)
      return state
    })

    return Service.of({ get, update, record, reconcile, decide })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Config.node, Database.node, EventV2.node] })
