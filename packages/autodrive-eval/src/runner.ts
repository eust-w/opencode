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
    readonly attempt?: (run: Run) => 1 | 2
    readonly onRecord?: (record: Trajectory, entry: LedgerEntry) => Promise<void>
  } = {},
) {
  const queue = [...runs]
  const records: Trajectory[] = []
  const ledger = [...(options.ledger ?? [])]
  const reservations: LedgerEntry[] = []
  const failures: unknown[] = []
  const concurrency = Math.min(options.concurrency ?? protocol.concurrency, protocol.concurrency, runs.length)

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length && !failures.length) {
        try {
          const run = queue.shift()
          if (!run) return
          const selected = options.budget?.(run)
          const category: BudgetCategory =
            selected?.category ?? (run.model === protocol.models.primary ? "primary" : "cross-model")
          const maxCostUSD =
            selected?.maxCostUSD ?? (category === "primary" ? caps.primary / 288 : caps[category] / 96)
          if (!Number.isFinite(maxCostUSD) || maxCostUSD <= 0)
            throw new Error(`${run.id} has an invalid $${maxCostUSD} cost ceiling`)
          const reservation: LedgerEntry = { category, amountUSD: maxCostUSD }
          const budget = summarizeBudget([...ledger, ...reservations, reservation])
          reservations.push(reservation)
          const record = await execute(
            run,
            executor,
            {
              category,
              maxCostUSD,
              remainingUSD: budget.remainingUSD,
            },
            options.attempt?.(run) ?? 1,
          ).finally(() => reservations.splice(reservations.indexOf(reservation), 1))
          if (record.costUSD > maxCostUSD)
            throw new Error(`${run.id} cost $${record.costUSD} exceeds its preregistered $${maxCostUSD} ceiling`)
          ledger.push({ category, amountUSD: record.costUSD })
          summarizeBudget(ledger)
          await options.onRecord?.(record, {
            category,
            amountUSD: record.costUSD,
          })
          records.push(record)
        } catch (error) {
          failures.push(error)
        }
      }
    }),
  )
  if (failures.length) throw failures[0]
  return records
}

async function execute(run: Run, executor: Executor, context: ExecutionContext, attempt: 1 | 2) {
  try {
    return await executor(run, attempt, context)
  } catch (error) {
    if (attempt === 2 || !(error instanceof InfrastructureFailure)) throw error
    if (error.costUSD > 0) throw new Error("Charged infrastructure failures require explicit ledger reconciliation")
    return executor(run, 2, context)
  }
}
