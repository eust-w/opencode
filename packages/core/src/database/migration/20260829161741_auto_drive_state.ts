import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260829161741_auto_drive_state",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_input\` ADD \`source\` text;`)
      yield* tx.run(`ALTER TABLE \`session\` ADD \`auto_drive\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
