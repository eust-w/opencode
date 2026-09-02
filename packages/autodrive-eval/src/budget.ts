export const caps = {
  pilot: 50,
  primary: 360,
  "cross-model": 288,
  boundary: 180,
} as const

export const boundarySourceCap = 102
export const totalCap = 800

export type BudgetCategory = keyof typeof caps

export interface LedgerEntry {
  readonly category: BudgetCategory
  readonly amountUSD: number
}

export class BudgetExceeded extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BudgetExceeded"
  }
}

export function summarizeBudget(entries: readonly LedgerEntry[]) {
  const categories = Object.fromEntries(Object.keys(caps).map((category) => [category, 0])) as Record<
    BudgetCategory,
    number
  >
  for (const entry of entries) {
    if (!Number.isFinite(entry.amountUSD) || entry.amountUSD < 0)
      throw new BudgetExceeded(`Invalid budget amount: ${entry.amountUSD}`)
    categories[entry.category] = currency(categories[entry.category] + entry.amountUSD)
    if (categories[entry.category] > caps[entry.category])
      throw new BudgetExceeded(`${entry.category} budget exceeds $${caps[entry.category]}`)
  }
  const totalUSD = currency(Object.values(categories).reduce((sum, value) => sum + value, 0))
  if (totalUSD > totalCap) throw new BudgetExceeded(`AutoDrive evaluation budget exceeds $${totalCap}`)
  return { categories, totalUSD, remainingUSD: currency(totalCap - totalUSD) }
}

export function summarizeBoundarySourceBudget(entries: readonly LedgerEntry[]) {
  const totalUSD = currency(
    entries
      .filter((entry) => entry.category === "boundary")
      .reduce((sum, entry) => sum + entry.amountUSD, 0),
  )
  if (totalUSD > boundarySourceCap)
    throw new BudgetExceeded(`boundary budget exceeds $${boundarySourceCap}`)
  return { totalUSD, remainingUSD: currency(boundarySourceCap - totalUSD) }
}

export type Failure =
  | "infrastructure"
  | "model-timeout"
  | "loop"
  | "budget-exhausted"
  | "retryable-provider"
  | "non-retryable-provider"
  | "grader"

export function canRetry(input: { readonly failure: Failure; readonly attempt: number }) {
  return input.failure === "infrastructure" && input.attempt === 1
}

function currency(value: number) {
  return Math.round(value * 100) / 100
}
