import { describe, expect } from "bun:test"
import { Agent } from "@opencode-ai/core/agent"
import { ToolInputRepairPlugin } from "@opencode-ai/core/plugin/tool-input-repair"
import { Session } from "@opencode-ai/core/session"
import { SessionMessage } from "@opencode-ai/core/session/message"
import type { ToolHooks } from "@opencode-ai/plugin/effect/tool"
import { Tool } from "@opencode-ai/schema/tool"
import { Effect } from "effect"
import { it } from "../lib/effect"
import { host } from "./host"

function run(input: unknown, inputSchema: ToolHooks["execute.before"]["inputSchema"]) {
  const event: ToolHooks["execute.before"] = {
    tool: "test",
    input,
    inputSchema,
    sessionID: Session.ID.make("ses_repair"),
    agent: Agent.ID.make("build"),
    messageID: SessionMessage.ID.make("msg_repair"),
    id: Tool.CallID.make("call_repair"),
  }
  const events: ToolHooks = {
    "execute.before": event,
    "execute.after": { ...event, status: "error", error: new Tool.Error({ message: "unused" }) },
  }
  const base = host()
  return ToolInputRepairPlugin.Plugin.effect(
    host({
      tool: {
        ...base.tool,
        hook: (name, callback) => callback(events[name]).pipe(Effect.orDie, Effect.as({ dispose: Effect.void })),
      },
    }),
  ).pipe(Effect.as(event))
}

const object = (properties: Record<string, unknown>, required?: string[]) => ({
  type: "object" as const,
  properties,
  ...(required ? { required } : {}),
})

describe("tool input repair plugin", () => {
  it.effect("preserves valid input identity and unknown properties", () =>
    Effect.gen(function* () {
      const input = { count: 2, nested: { enabled: true }, extra: "keep" }
      const event = yield* run(
        input,
        object({ count: { type: "integer" }, nested: object({ enabled: { type: "boolean" } }) }),
      )
      expect(event.input).toBe(input)
      expect(event.input).toEqual(input)
    }),
  )

  it.effect("removes only optional nulls that explicitly exclude null", () =>
    Effect.gen(function* () {
      const event = yield* run(
        { optional: null, required: null, nullable: null, union: null, unknown: null },
        object(
          {
            optional: { type: "string" },
            required: { type: "string" },
            nullable: { type: "string", nullable: true },
            union: { type: ["string", "null"] },
            unknown: {},
          },
          ["required"],
        ),
      )
      expect(event.input).toEqual({ required: null, nullable: null, union: null, unknown: null })
    }),
  )

  it.effect("removes empty object placeholders only from optional non-object fields", () =>
    Effect.gen(function* () {
      const input = {
        optional: {},
        array: {},
        required: {},
        object: {},
        populated: { value: 1 },
        union: {},
        unknown: {},
      }
      const event = yield* run(
        input,
        object(
          {
            optional: { type: "integer" },
            array: { type: "array", items: { type: "string" } },
            required: { type: "boolean" },
            object: { type: "object" },
            populated: { type: "string" },
            union: { type: "string", anyOf: [{ type: "string" }, { type: "object" }] },
            unknown: {},
          },
          ["required"],
        ),
      )

      expect(event.input).toEqual({ required: {}, object: {}, populated: { value: 1 }, union: {}, unknown: {} })
      expect(input.optional).toEqual({})
      expect(input.array).toEqual({})
    }),
  )

  it.effect("coerces valid numeric and boolean strings without changing invalid candidates", () =>
    Effect.gen(function* () {
      const event = yield* run(
        {
          number: "1.5",
          integer: "42",
          enabled: "true",
          disabled: "false",
          empty: " ",
          infinite: "Infinity",
          fractional: "1.5",
          unsafe: "9007199254740992",
          uppercase: "TRUE",
        },
        object({
          number: { type: "number" },
          integer: { type: "integer" },
          enabled: { type: "boolean" },
          disabled: { type: "boolean" },
          empty: { type: "number" },
          infinite: { type: "number" },
          fractional: { type: "integer" },
          unsafe: { type: "integer" },
          uppercase: { type: "boolean" },
        }),
      )
      expect(event.input).toEqual({
        number: 1.5,
        integer: 42,
        enabled: true,
        disabled: false,
        empty: " ",
        infinite: "Infinity",
        fractional: "1.5",
        unsafe: "9007199254740992",
        uppercase: "TRUE",
      })
    }),
  )

  it.effect("parses only explicitly expected stringified containers", () =>
    Effect.gen(function* () {
      const event = yield* run(
        { list: '["a","b"]', item: '{"count":"2"}', invalid: "{broken", mismatch: '"text"' },
        object({
          list: { type: "array", items: { type: "string" } },
          item: object({ count: { type: "integer" } }),
          invalid: object({ value: { type: "string" } }),
          mismatch: object({ value: { type: "string" } }),
        }),
      )
      expect(event.input).toEqual({
        list: ["a", "b"],
        item: { count: 2 },
        invalid: "{broken",
        mismatch: '"text"',
      })
    }),
  )

  it.effect("wraps only values that clearly match array items", () =>
    Effect.gen(function* () {
      const event = yield* run(
        { text: "one", number: 2, item: { name: "one" }, incompatible: 2, fractional: 1.5 },
        object({
          text: { type: "array", items: { type: "string" } },
          number: { type: "array", items: { type: "number" } },
          item: { type: "array", items: object({ name: { type: "string" } }) },
          incompatible: { type: "array", items: { type: "string" } },
          fractional: { type: "array", items: { type: "integer" } },
        }),
      )
      expect(event.input).toEqual({
        text: ["one"],
        number: [2],
        item: [{ name: "one" }],
        incompatible: 2,
        fractional: 1.5,
      })
    }),
  )

  it.effect("repairs nested question-like fields without mutating original containers", () =>
    Effect.gen(function* () {
      const question = { question: "Pick one", multiple: "false", options: { label: "First", description: null } }
      const input = { questions: [question] }
      const event = yield* run(
        input,
        object({
          questions: {
            type: "array",
            items: object({
              question: { type: "string" },
              multiple: { type: "boolean" },
              options: {
                type: "array",
                items: object({ label: { type: "string" }, description: { type: "string" } }, ["label"]),
              },
            }),
          },
        }),
      )
      expect(event.input).toEqual({
        questions: [{ question: "Pick one", multiple: false, options: [{ label: "First" }] }],
      })
      expect(input).toEqual({ questions: [question] })
      expect(question).toEqual({
        question: "Pick one",
        multiple: "false",
        options: { label: "First", description: null },
      })
      expect(event.input).not.toBe(input)
    }),
  )

  it.effect("skips ambiguous unions, unsupported schemas, and root repairs", () =>
    Effect.gen(function* () {
      const input = { either: "2", variants: "true", types: "3", unknown: "4" }
      const event = yield* run(
        input,
        object({
          either: { type: "number", anyOf: [{ type: "number" }, { type: "string" }] },
          variants: { type: "boolean", oneOf: [{ type: "boolean" }, { type: "string" }] },
          types: { type: ["number", "string"] },
          unknown: {},
        }),
      )
      expect(event.input).toBe(input)
      expect((yield* run('{"count":"2"}', object({ count: { type: "integer" } }))).input).toBe('{"count":"2"}')
    }),
  )
})
