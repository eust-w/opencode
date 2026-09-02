export const caps = {
  pilot: 50,
  primary: 360,
  "cross-model": 288,
  boundary: 180,
} as const

export const boundarySourceCap = 102
export const annotationPanelOriginalCap = 20
export const annotationPanelCap = 40
export const totalCap = 800
const budgetEpsilon = 1e-9

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
  const raw = Object.fromEntries(Object.keys(caps).map((category) => [category, 0])) as Record<
    BudgetCategory,
    number
  >
  for (const entry of entries) {
    if (!Number.isFinite(entry.amountUSD) || entry.amountUSD < 0)
      throw new BudgetExceeded(`Invalid budget amount: ${entry.amountUSD}`)
    raw[entry.category] += entry.amountUSD
    if (raw[entry.category] > caps[entry.category] + budgetEpsilon)
      throw new BudgetExceeded(`${entry.category} budget exceeds $${caps[entry.category]}`)
  }
  const rawTotal = Object.values(raw).reduce((sum, value) => sum + value, 0)
  if (rawTotal > totalCap + budgetEpsilon)
    throw new BudgetExceeded(`AutoDrive evaluation budget exceeds $${totalCap}`)
  const categories = Object.fromEntries(
    Object.entries(raw).map(([category, amount]) => [category, currency(amount)]),
  ) as Record<BudgetCategory, number>
  const totalUSD = currency(rawTotal)
  return { categories, totalUSD, remainingUSD: currency(totalCap - rawTotal) }
}

export function summarizeBoundarySourceBudget(entries: readonly LedgerEntry[]) {
  const rawTotal = entries
    .filter((entry) => entry.category === "boundary")
    .reduce((sum, entry) => sum + entry.amountUSD, 0)
  if (rawTotal > boundarySourceCap + budgetEpsilon)
    throw new BudgetExceeded(`boundary budget exceeds $${boundarySourceCap}`)
  const totalUSD = currency(rawTotal)
  return { totalUSD, remainingUSD: currency(boundarySourceCap - rawTotal) }
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
