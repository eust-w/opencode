export const caps = {
  pilot: 50,
  primary: 360,
  "cross-model": 288,
  boundary: 102,
} as const

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
  if (totalUSD > 800) throw new BudgetExceeded("AutoDrive evaluation budget exceeds $800")
  return { categories, totalUSD, remainingUSD: currency(800 - totalUSD) }
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
