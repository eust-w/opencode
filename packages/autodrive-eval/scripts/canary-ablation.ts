import { mkdir } from "node:fs/promises"
import path from "node:path"
import {
  analyzeCanaryAblation,
  renderCanaryCSV,
  renderCanaryLatex,
  renderCanaryLatexTable,
} from "../src/canary"
import { parseTrajectory } from "../src/artifact"

const root = path.resolve(import.meta.dir, "../../..")
const pilot = path.join(root, "research/auto-drive/pilot")
const inputs = [
  "2026-08-30-v1.13-dvc-oracle-canary",
  "2026-08-30-v1.13-dvc-blind-canary",
  "2026-08-30-v1.13-dvc-regex-canary",
  "2026-08-30-v1.13-dvc-supervisor-canary",
].map((directory) => path.join(pilot, directory, "artifacts/canary/trajectories.jsonl"))
const output = path.resolve(option("output") ?? path.join(root, "research/auto-drive/results/canary-v1.13"))
const records = await Promise.all(
  inputs.map(async (filePath) => {
    const lines = (await Bun.file(filePath).text()).split("\n").filter((line) => line.trim().length > 0)
    if (lines.length !== 1) throw new Error(`Expected exactly one canary trajectory: ${filePath}`)
    return parseTrajectory(JSON.parse(lines[0]))
  }),
)
const rows = analyzeCanaryAblation(records)
const summary = {
  schemaVersion: 1,
  classification: "accepted-canary-ablation",
  resultType: "single-task-unpaired-canary",
  formalInference: false,
  taskID: rows[0].taskID,
  firstBoundaryResolved: rows.filter((row) => row.firstBoundaryResolved).length,
  finalResolved: rows.filter((row) => row.finalResolved).length,
  totalCostUSD: rows.reduce((total, row) => total + row.costUSD, 0),
  rows,
}

await mkdir(output, { recursive: true })
await Promise.all([
  Bun.write(path.join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n"),
  Bun.write(path.join(output, "runs.csv"), renderCanaryCSV(rows)),
  Bun.write(path.join(output, "table.tex"), renderCanaryLatex(rows)),
  Bun.write(path.join(root, "research/auto-drive/paper/generated/canary-v1.13.tex"), renderCanaryLatexTable(rows)),
])
console.log(JSON.stringify({ output, strategies: rows.length, finalResolved: summary.finalResolved }))

function option(name: string) {
  const index = Bun.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : Bun.argv[index + 1]
}
