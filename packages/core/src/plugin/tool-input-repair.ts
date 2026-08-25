export * as ToolInputRepairPlugin from "./tool-input-repair.js"

import { define } from "@opencode-ai/plugin/effect/plugin"
import { Effect, Option, Predicate, Schema } from "effect"
import type { JsonSchema } from "effect"

// Repairs apply only when the input schema unambiguously supports them:
// - Stringified root object: '{"limit":"20"}' -> { limit: 20 }
// - Unknown closed-object property: { limit: 20, extra: true } -> { limit: 20 }
// - Optional non-nullable null: { limit: null } -> {}
// - Optional non-object placeholder: { limit: {} } -> {}
// - Numeric string: { limit: "20" } -> { limit: 20 }
// - Boolean string: { enabled: "false" } -> { enabled: false }
// - Nullable numeric union: { limit: "20" } -> { limit: 20 }
// - Tagged object union: { item: { kind: "count", value: "2" } } -> { item: { kind: "count", value: 2 } }
// - Stringified array: { tags: '["a"]' } -> { tags: ["a"] }
// - Positional tuple: { pair: ["2", "false"] } -> { pair: [2, false] }
// - Typed dictionary: { counts: { first: "2" } } -> { counts: { first: 2 } }
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
        if (event.inputSchema.type !== "object") return
        event.input = repair(event.input, event.inputSchema, 0)
      }),
    ),
})

function repair(value: unknown, schema: JsonSchema.JsonSchema, depth: number): unknown {
  if (depth > maxDepth) return value

  const alternatives = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : Array.isArray(schema.type)
        ? schema.type.map((type) => ({ ...schema, type }))
        : undefined

  const base =
    alternatives && schema.type === "object"
      ? repairObject(value, schema, depth)
      : alternatives
        ? value
        : repairType(value, schema, depth)
  const selected = alternatives ? repairUnion(base, alternatives, depth) : base
  if (!Array.isArray(schema.allOf)) return selected

  return schema.allOf.reduce<unknown>((result, member) => {
    if (!Predicate.isObject(member)) return result
    const intersection =
      Predicate.isObject(result) && member.additionalProperties === false
        ? { ...member, additionalProperties: true }
        : member
    return repair(result, intersection, depth + 1)
  }, selected)
}

function repairType(value: unknown, schema: JsonSchema.JsonSchema, depth: number): unknown {
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
      if (Predicate.isObject(schema.properties) || Array.isArray(schema.required)) {
        return repairObject(value, schema, depth)
      }
      return value
  }
}

function repairUnion(value: unknown, alternatives: unknown[], depth: number): unknown {
  const branches = alternatives.filter(Predicate.isObject)
  const matching = branches.filter((branch) => matchesSchema(value, branch))
  const matched = matching[0]
  if (matching.length === 1 && matched) {
    return Predicate.isObject(value) ? repair(value, matched, depth + 1) : value
  }
  if (matching.length > 1) return value

  const candidates = branches
    .map((branch) => ({ branch, value: repair(value, branch, depth + 1) }))
    .filter((candidate) => matchesSchema(candidate.value, candidate.branch))
  const candidate = candidates[0]
  if (candidates.length !== 1 || !candidate) return value
  if (branches.filter((branch) => matchesSchema(candidate.value, branch)).length !== 1) return value
  return candidate.value
}

function matchesSchema(value: unknown, schema: JsonSchema.JsonSchema): boolean {
  if ("const" in schema && value !== schema.const) return false
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false

  if (Array.isArray(schema.type)) return schema.type.some((type) => matchesSchema(value, { ...schema, type }))

  switch (schema.type) {
    case "null":
      return value === null
    case "object":
      return matchesObject(value, schema)
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
      if (Predicate.isObject(schema.properties) || Array.isArray(schema.required)) return matchesObject(value, schema)
      return "const" in schema || Array.isArray(schema.enum)
  }
}

function matchesObject(value: unknown, schema: JsonSchema.JsonSchema): boolean {
  if (!Predicate.isObject(value)) return false
  if (Array.isArray(schema.required) && !schema.required.every((key) => typeof key === "string" && key in value)) {
    return false
  }
  if (!Predicate.isObject(schema.properties)) return true

  return Object.entries(schema.properties).every(([key, property]) => {
    if (!(key in value) || !Predicate.isObject(property)) return true
    if ("const" in property) return value[key] === property.const
    if (Array.isArray(property.enum) && property.enum.length === 1) return value[key] === property.enum[0]
    return true
  })
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

  const properties = Predicate.isObject(schema.properties) ? schema.properties : {}
  const required = Array.isArray(schema.required) ? schema.required : []
  const declared = Object.entries(properties).reduce<Record<string, unknown>>(
    (result, [key, property]) => {
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
    },
    removeUnknownProperties(parsed, schema),
  )

  const additional = schema.additionalProperties
  if (!Predicate.isObject(additional) || "patternProperties" in schema || "$ref" in schema || "allOf" in schema) {
    return declared
  }

  return Object.keys(declared).reduce<Record<string, unknown>>((result, key) => {
    if (Object.hasOwn(properties, key)) return result
    const current = result[key]
    const next = repair(current, additional, depth + 1)
    return next === current ? result : { ...result, [key]: next }
  }, declared)
}

function removeUnknownProperties(value: Record<string, unknown>, schema: JsonSchema.JsonSchema) {
  const properties = schema.properties
  if (
    schema.additionalProperties !== false ||
    !Predicate.isObject(properties) ||
    "patternProperties" in schema ||
    "$ref" in schema ||
    "allOf" in schema
  ) {
    return value
  }

  return Object.keys(value).reduce<Record<string, unknown>>((result, key) => {
    if (Object.hasOwn(properties, key)) return result
    const next = { ...result }
    delete next[key]
    return next
  }, value)
}

function repairArray(value: unknown, schema: JsonSchema.JsonSchema, depth: number): unknown {
  const tuple = Array.isArray(schema.prefixItems)
    ? schema.prefixItems
    : Array.isArray(schema.items)
      ? schema.items
      : undefined
  const items = Predicate.isObject(schema.items) ? schema.items : undefined
  if (!tuple && !items) return value

  const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
  if (Array.isArray(parsed)) {
    const repaired = parsed.map((item, index) => {
      const itemSchema = tuple ? (tuple[index] ?? (Array.isArray(schema.prefixItems) ? items : undefined)) : items
      return Predicate.isObject(itemSchema) ? repair(item, itemSchema, depth + 1) : item
    })
    return repaired.every((item, index) => item === parsed[index]) ? parsed : repaired
  }
  if (tuple || !items) return value

  const item = repair(value, items, depth + 1)
  return matchesSchema(item, items) ? [item] : value
}
