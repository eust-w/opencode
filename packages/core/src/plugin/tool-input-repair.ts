export * as ToolInputRepairPlugin from "./tool-input-repair.js"

import { define } from "@opencode-ai/plugin/effect/plugin"
import { Effect, Option, Predicate, Schema } from "effect"
import type { JsonSchema } from "effect"

// Repairs apply only when the input schema unambiguously supports them:
// - Optional non-nullable null: { limit: null } -> {}
// - Optional non-object placeholder: { limit: {} } -> {}
// - Numeric string: { limit: "20" } -> { limit: 20 }
// - Boolean string: { enabled: "false" } -> { enabled: false }
// - Stringified array: { tags: '["a"]' } -> { tags: ["a"] }
// - Stringified object: { options: '{"enabled":true}' } -> { options: { enabled: true } }
// - Compatible array item: { tags: "a" } -> { tags: ["a"] }
// - Repaired array item: { counts: "2" } -> { counts: [2] }
// - Nested fields: { items: [{ count: "2" }] } -> { items: [{ count: 2 }] }

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))
const maxDepth = 6

export const Plugin = define({
  id: "opencode.tool.input.repair",
  effect: (ctx) =>
    ctx.tool.hook("execute.before", (event) =>
      Effect.sync(() => {
        if (!Predicate.isObject(event.input) || event.inputSchema.type !== "object") return
        event.input = repair(event.input, event.inputSchema, 0)
      }),
    ),
})

function repair(value: unknown, schema: JsonSchema.JsonSchema, depth: number): unknown {
  if (depth > maxDepth || "anyOf" in schema || "oneOf" in schema) return value

  switch (schema.type) {
    case "number":
    case "integer":
      return repairNumber(value, schema.type === "integer")
    case "boolean":
      return repairBoolean(value)
    case "object":
      return repairObject(value, schema, depth)
    case "array":
      return repairArray(value, schema, depth)
    default:
      return value
  }
}

function repairNumber(value: unknown, integer: boolean): unknown {
  if (typeof value !== "string" || value.trim() === "") return value
  const number = Number(value)
  if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number))) return value
  return number
}

function repairBoolean(value: unknown): unknown {
  if (value === "true") return true
  if (value === "false") return false
  return value
}

function repairObject(value: unknown, schema: JsonSchema.JsonSchema, depth: number): unknown {
  const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
  if (!Predicate.isObject(parsed)) return value
  if (!Predicate.isObject(schema.properties)) return parsed

  const required = Array.isArray(schema.required) ? schema.required : []
  return Object.entries(schema.properties).reduce<Record<string, unknown>>((result, [key, property]) => {
    if (!(key in result) || !Predicate.isObject(property)) return result
    const current = result[key]

    // Null is removable only when omission is valid and the property cannot itself accept null.
    if (
      current === null &&
      !required.includes(key) &&
      typeof property.type === "string" &&
      property.type !== "null" &&
      property.nullable !== true &&
      !("anyOf" in property) &&
      !("oneOf" in property)
    ) {
      const next = { ...result }
      delete next[key]
      return next
    }

    // Empty objects are placeholders only when the optional property expects another type.
    if (
      Predicate.isObject(current) &&
      Object.keys(current).length === 0 &&
      !required.includes(key) &&
      typeof property.type === "string" &&
      property.type !== "object" &&
      !("anyOf" in property) &&
      !("oneOf" in property)
    ) {
      const next = { ...result }
      delete next[key]
      return next
    }

    const next = repair(current, property, depth + 1)
    return next === current ? result : { ...result, [key]: next }
  }, parsed)
}

function repairArray(value: unknown, schema: JsonSchema.JsonSchema, depth: number): unknown {
  const items = schema.items
  if (!Predicate.isObject(items)) return value

  const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
  if (Array.isArray(parsed)) {
    const repaired = parsed.map((item) => repair(item, items, depth + 1))
    return repaired.every((item, index) => item === parsed[index]) ? parsed : repaired
  }

  const item = repair(value, items, depth + 1)
  return matchesArrayItem(item, items) ? [item] : value
}

function matchesArrayItem(value: unknown, schema: JsonSchema.JsonSchema) {
  if ("anyOf" in schema || "oneOf" in schema) return false

  switch (schema.type) {
    case "object":
      return Predicate.isObject(value)
    case "array":
      return Array.isArray(value)
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value)
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "string":
    case "boolean":
      return typeof value === schema.type
    default:
      return false
  }
}
