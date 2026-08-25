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

  it.effect("parses stringified root objects and repairs their fields", () =>
    Effect.gen(function* () {
      const schema = object({ count: { type: "integer" } })

      expect((yield* run('{"count":"2"}', schema)).input).toEqual({ count: 2 })
      expect((yield* run("{broken", schema)).input).toBe("{broken")
      expect((yield* run("[]", schema)).input).toBe("[]")
      expect((yield* run(null, schema)).input).toBeNull()
    }),
  )

  it.effect("removes unknown properties only from explicitly closed objects", () =>
    Effect.gen(function* () {
      const input = {
        known: "2",
        extra: true,
        closed: { keep: "3", extra: true },
        open: { keep: "4", extra: true },
        items: [{ keep: "5", extra: true }],
      }
      const event = yield* run(input, {
        ...object({
          known: { type: "integer" },
          closed: { ...object({ keep: { type: "integer" } }), additionalProperties: false },
          open: object({ keep: { type: "integer" } }),
          items: {
            type: "array",
            items: { ...object({ keep: { type: "integer" } }), additionalProperties: false },
          },
        }),
        additionalProperties: false,
      })

      expect(event.input).toEqual({
        known: 2,
        closed: { keep: 3 },
        open: { keep: 4, extra: true },
        items: [{ keep: 5 }],
      })
      expect(input.extra).toBeTrue()
      expect(input.closed.extra).toBeTrue()
      expect(input.items[0]?.extra).toBeTrue()

      const empty = yield* run({ extra: true }, { ...object({}), additionalProperties: false })
      expect(empty.input).toEqual({})
    }),
  )

  it.effect("preserves unknown properties allowed by open or dynamic schemas", () =>
    Effect.gen(function* () {
      const input = { known: 1, extra: true }
      const properties = { known: { type: "integer" } }
      const schemas = [
        object(properties),
        { ...object(properties), additionalProperties: true },
        { ...object(properties), additionalProperties: { type: "boolean" } },
        { ...object(properties), additionalProperties: false, patternProperties: { "^extra$": { type: "boolean" } } },
        { ...object(properties), additionalProperties: false, allOf: [{ properties: { extra: { type: "boolean" } } }] },
        { ...object(properties), additionalProperties: false, $ref: "#/$defs/example" },
      ]

      for (const schema of schemas) expect((yield* run(input, schema)).input).toBe(input)
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
        {
          text: "one",
          number: 2,
          integer: "42",
          boolean: "false",
          item: { name: "one" },
          stringified: '{"count":"2"}',
          incompatible: 2,
          fractional: 1.5,
        },
        object({
          text: { type: "array", items: { type: "string" } },
          number: { type: "array", items: { type: "number" } },
          integer: { type: "array", items: { type: "integer" } },
          boolean: { type: "array", items: { type: "boolean" } },
          item: { type: "array", items: object({ name: { type: "string" } }) },
          stringified: { type: "array", items: object({ count: { type: "integer" } }) },
          incompatible: { type: "array", items: { type: "string" } },
          fractional: { type: "array", items: { type: "integer" } },
        }),
      )
      expect(event.input).toEqual({
        text: ["one"],
        number: [2],
        integer: [42],
        boolean: [false],
        item: [{ name: "one" }],
        stringified: [{ count: 2 }],
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

  it.effect("skips ambiguous unions and unsupported schemas", () =>
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
    }),
  )
})
