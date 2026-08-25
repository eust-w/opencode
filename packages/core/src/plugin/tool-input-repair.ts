export * as ToolInputRepairPlugin from "./tool-input-repair.js"

import { define } from "@opencode-ai/plugin/effect/plugin"
import { Effect, Option, Schema } from "effect"

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))

export const Plugin = define({
  id: "opencode.tool.input.repair",
  effect: (ctx) =>
    ctx.tool.hook("execute.before", (event) =>
      Effect.sync(() => {
        if (!isRecord(event.input) || event.inputSchema.type !== "object") return
        event.input = repair(event.input, event.inputSchema, 0)
      }),
    ),
})

function repair(value: unknown, schema: unknown, depth: number): unknown {
  if (depth > 6 || !isRecord(schema) || "anyOf" in schema || "oneOf" in schema || typeof schema.type !== "string") {
    return value
  }

  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "string" || value.trim() === "") return value
    const number = Number(value)
    if (!Number.isFinite(number) || (schema.type === "integer" && !Number.isSafeInteger(number))) return value
    return number
  }

  if (schema.type === "boolean") {
    if (value === "true") return true
    if (value === "false") return false
    return value
  }

  if (schema.type === "object") {
    const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
    if (!isRecord(parsed) || !isRecord(schema.properties)) return isRecord(parsed) ? parsed : value
    const required = Array.isArray(schema.required) ? schema.required : []
    return Object.entries(schema.properties).reduce<Record<string, unknown>>((result, [key, property]) => {
      if (!(key in result)) return result
      const current = result[key]
      if (
        current === null &&
        !required.includes(key) &&
        isRecord(property) &&
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
      const next = repair(current, property, depth + 1)
      return next === current ? result : { ...result, [key]: next }
    }, parsed)
  }

  if (schema.type !== "array" || !isRecord(schema.items)) return value
  const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
  const array = Array.isArray(parsed) ? parsed : matches(value, schema.items) ? [value] : undefined
  if (!array) return value
  const next = array.map((item) => repair(item, schema.items, depth + 1))
  return next.every((item, index) => item === array[index]) ? array : next
}

function matches(value: unknown, schema: Record<string, unknown>) {
  if ("anyOf" in schema || "oneOf" in schema || typeof schema.type !== "string") return false
  if (schema.type === "object") return isRecord(value)
  if (schema.type === "array") return Array.isArray(value)
  if (schema.type === "integer") return typeof value === "number" && Number.isSafeInteger(value)
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value)
  return (schema.type === "string" || schema.type === "boolean") && typeof value === schema.type
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
