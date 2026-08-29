import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Config } from "@opencode-ai/core/config"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionAutoDriveController } from "@opencode-ai/core/session/auto-drive-controller"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { SessionInput } from "@opencode-ai/core/session/input"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionInputTable, SessionTable } from "@opencode-ai/core/session/sql"
import { testEffect } from "./lib/effect"

const config = Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, EventV2.node, SessionProjector.node, SessionAutoDriveController.node]),
    [[Config.node, config]],
  ),
)
const sessionID = SessionV2.ID.make("ses_auto_drive_controller")

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .onConflictDoNothing()
    .run()
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: "test",
      directory: "/project",
      title: "test",
      version: "test",
    })
    .onConflictDoNothing()
    .run()
})

describe("SessionAutoDriveController", () => {
  it.effect("persists Session settings through auto-drive.updated", () =>
    Effect.gen(function* () {
      yield* setup
      const controller = yield* SessionAutoDriveController.Service
      const state = yield* controller.update(sessionID, { enabled: true, maxRuns: 3, memory: false })

      expect(state.settings).toMatchObject({ enabled: true, policy: "supervisor", maxRuns: 3, memory: false })
      expect((yield* controller.get(sessionID)).settings).toEqual(state.settings)
      expect(
        yield* (yield* Database.Service).db
          .select({ type: EventTable.type })
          .from(EventTable)
          .where(eq(EventTable.type, EventV2.versionedType(SessionEvent.AutoDrive.Updated.type, 1)))
          .all(),
      ).toHaveLength(1)
    }),
  )

  it.effect("recovers the decision-to-admission crash window exactly once", () =>
    Effect.gen(function* () {
      yield* setup
      const controller = yield* SessionAutoDriveController.Service
      yield* controller.update(sessionID, { enabled: true })
      const inputID = SessionMessage.ID.make("msg_auto_drive_recovery")
      yield* controller.record({
        sessionID,
        action: "continue",
        reason: "Tests remain",
        nextPrompt: "Run the remaining tests.",
        chainID: "chain-recovery",
        inputID,
      })
      const { db } = yield* Database.Service
      expect(yield* SessionInput.find(db, inputID)).toBeUndefined()

      yield* controller.reconcile(sessionID)
      yield* controller.reconcile(sessionID)

      expect(yield* SessionInput.find(db, inputID)).toMatchObject({
        delivery: "queue",
        source: { type: "auto-drive", chainID: "chain-recovery", decision: "continue", continuation: 1 },
      })
      expect(yield* db.select().from(SessionInputTable).where(eq(SessionInputTable.id, inputID)).all()).toHaveLength(1)
      expect(
        yield* db
          .select()
          .from(EventTable)
          .where(eq(EventTable.type, EventV2.versionedType(SessionEvent.PromptAdmitted.type, 1)))
          .all(),
      ).toHaveLength(1)
    }),
  )

  it.effect("stops before exceeding the persisted continuation limit", () =>
    Effect.gen(function* () {
      yield* setup
      const controller = yield* SessionAutoDriveController.Service
      yield* controller.update(sessionID, { enabled: true, maxRuns: 1 })
      yield* controller.record({
        sessionID,
        action: "continue",
        nextPrompt: "First continuation",
        chainID: "chain-limit",
        inputID: SessionMessage.ID.make("msg_auto_drive_first"),
      })
      const state = yield* controller.record({
        sessionID,
        action: "continue",
        nextPrompt: "Second continuation",
        chainID: "chain-limit",
        inputID: SessionMessage.ID.make("msg_auto_drive_second"),
      })

      expect(state.status).toMatchObject({
        action: "stop",
        reason: "Maximum continuation count reached",
        chainID: "chain-limit",
        continuationCount: 1,
      })
      expect(state.status.inputID).toBeUndefined()
    }),
  )
})
