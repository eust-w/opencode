import { createHash } from "node:crypto"
import type { BoundaryLabel } from "./statistics"

export interface Boundary {
  readonly id: string
  readonly baseTrajectoryID: string
  readonly label: BoundaryLabel
}

export function splitBoundaries<T extends Boundary>(
  boundaries: readonly T[],
  options: { readonly developmentSize: number; readonly seed: string },
) {
  const counts = Object.fromEntries(
    (["continue", "stop", "defer"] as const).map((label) => [
      label,
      boundaries.filter((boundary) => boundary.label === label).length,
    ]),
  )
  if (Object.values(counts).some((count) => count !== 60))
    throw new Error("Boundary pool must contain exactly 60 examples per label")
  if (new Set(boundaries.map((boundary) => boundary.id)).size !== boundaries.length)
    throw new Error("Boundary IDs must be unique")

  const groups = Array.from(Map.groupBy(boundaries, (boundary) => boundary.baseTrajectoryID).entries())
    .map(([id, items]) => ({
      id,
      items,
      rank: createHash("sha256").update(`${options.seed}\0${id}`).digest("hex"),
    }))
    .sort((a, b) => a.rank.localeCompare(b.rank))
  const choices = new Map<number, number[]>([[0, []]])
  for (const [index, group] of groups.entries()) {
    for (const [size, selected] of Array.from(choices.entries()).sort((a, b) => b[0] - a[0])) {
      const next = size + group.items.length
      if (next > options.developmentSize || choices.has(next)) continue
      choices.set(next, [...selected, index])
    }
  }
  const selected = choices.get(options.developmentSize)
  if (!selected) throw new Error(`Cannot form a grouped development split of ${options.developmentSize} examples`)
  const developmentGroups = new Set(selected.map((index) => groups[index]!.id))
  return {
    development: boundaries.filter((boundary) => developmentGroups.has(boundary.baseTrajectoryID)),
    frozen: boundaries.filter((boundary) => !developmentGroups.has(boundary.baseTrajectoryID)),
  }
}
