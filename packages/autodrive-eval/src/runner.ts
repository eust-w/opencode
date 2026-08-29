import type { Trajectory } from "./artifact"
import { caps, summarizeBudget, type BudgetCategory, type LedgerEntry } from "./budget"
import { protocol, type Run } from "./protocol"

export class InfrastructureFailure extends Error {
  constructor(
    message: string,
    readonly costUSD = 0,
  ) {
    super(message)
    this.name = "InfrastructureFailure"
  }
}

export interface ExecutionContext {
  readonly category: BudgetCategory
  readonly maxCostUSD: number
  readonly remainingUSD: number
}

export type Executor = (run: Run, attempt: number, context: ExecutionContext) => Promise<Trajectory>

export async function executeRuns(
  runs: readonly Run[],
  executor: Executor,
  options: {
    readonly concurrency?: number
    readonly ledger?: readonly LedgerEntry[]
    readonly budget?: (run: Run) => {
      readonly category: BudgetCategory
      readonly maxCostUSD: number
    }
    readonly onRecord?: (record: Trajectory, entry: LedgerEntry) => Promise<void>
  } = {},
) {
  const queue = [...runs]
  const records: Trajectory[] = []
  const ledger = [...(options.ledger ?? [])]
  const reservations: LedgerEntry[] = []
  const concurrency = Math.min(options.concurrency ?? protocol.concurrency, protocol.concurrency, runs.length)

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const run = queue.shift()
        if (!run) return
        const selected = options.budget?.(run)
        const category: BudgetCategory =
          selected?.category ?? (run.model === protocol.models.primary ? "primary" : "cross-model")
        const maxCostUSD = selected?.maxCostUSD ?? (category === "primary" ? caps.primary / 288 : caps[category] / 96)
        if (!Number.isFinite(maxCostUSD) || maxCostUSD <= 0)
          throw new Error(`${run.id} has an invalid $${maxCostUSD} cost ceiling`)
        const reservation: LedgerEntry = { category, amountUSD: maxCostUSD }
        const budget = summarizeBudget([...ledger, ...reservations, reservation])
        reservations.push(reservation)
        const record = await execute(run, executor, {
          category,
          maxCostUSD,
          remainingUSD: budget.remainingUSD,
        }).finally(() => reservations.splice(reservations.indexOf(reservation), 1))
        if (record.costUSD > maxCostUSD)
          throw new Error(`${run.id} cost $${record.costUSD} exceeds its preregistered $${maxCostUSD} ceiling`)
        ledger.push({ category, amountUSD: record.costUSD })
        summarizeBudget(ledger)
        await options.onRecord?.(record, {
          category,
          amountUSD: record.costUSD,
        })
        records.push(record)
      }
    }),
  )
  return records
}

async function execute(run: Run, executor: Executor, context: ExecutionContext) {
  try {
    return await executor(run, 1, context)
  } catch (error) {
    if (!(error instanceof InfrastructureFailure)) throw error
    if (error.costUSD > 0) throw new Error("Charged infrastructure failures require explicit ledger reconciliation")
    return executor(run, 2, context)
  }
}
