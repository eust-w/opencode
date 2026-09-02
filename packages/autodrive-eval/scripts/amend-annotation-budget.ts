#!/usr/bin/env bun

import { writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { assertSecretFree } from "../src/artifact"
import { annotationPanelCap, annotationPanelOriginalCap, caps, totalCap } from "../src/budget"
import { protocol } from "../src/protocol"

const CampaignReceipt = z.object({
  protocol: z.literal(protocol.version),
  annotator: z.string().min(1),
  model: z.string().min(1),
  candidatesSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  preflightSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  maxCostUSD: z.literal(annotationPanelOriginalCap),
})

const receiptPath = path.resolve(requireOption("receipt"))
const output = path.resolve(requireOption("output"))
const receiptContent = await Bun.file(receiptPath).text()
assertSecretFree(receiptContent)
const receipt = CampaignReceipt.parse(JSON.parse(receiptContent))
const amendment = {
  schemaVersion: 1 as const,
  protocol: protocol.version,
  method: "annotation-budget-amendment" as const,
  authorization: "user-approved-budget-reallocation" as const,
  authorizedAt: new Date().toISOString(),
  annotator: receipt.annotator,
  model: receipt.model,
  candidatesSHA256: receipt.candidatesSHA256,
  preflightSHA256: receipt.preflightSHA256,
  receiptSHA256: digest(receiptContent),
  previousMaxCostUSD: annotationPanelOriginalCap,
  maxCostUSD: annotationPanelCap,
  boundaryCapUSD: caps.boundary,
  totalCapUSD: totalCap,
}
const content = JSON.stringify(amendment, null, 2) + "\n"
assertSecretFree(content)
await writeFile(output, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
console.log(JSON.stringify({ output, receiptSHA256: amendment.receiptSHA256, maxCostUSD: annotationPanelCap }))

function requireOption(name: string) {
  const index = Bun.argv.indexOf(`--${name}`)
  const value = index < 0 ? undefined : Bun.argv[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`--${name} is required`)
  return value
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}
