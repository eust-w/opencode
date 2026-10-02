import { exactMcNemar } from "./statistics"

const rejected = new Map<string, readonly number[]>()

export function binomialProbabilities(n: number, probability: number): number[] {
  requireCount(n)
  requireProbability(probability)
  if (probability === 0 || probability === 1)
    return Array.from({ length: n + 1 }, (_, index) => Number(index === n * probability))
  if (probability > 0.5) return binomialProbabilities(n, 1 - probability).reverse()
  const probabilities = [(1 - probability) ** n]
  for (let index = 1; index <= n; index++) {
    probabilities.push(probabilities[index - 1]! * ((n - index + 1) / index) * (probability / (1 - probability)))
  }
  return probabilities
}

export function exactMcNemarPower(input: { n: number; discordance: number; winProbability: number; alpha: number }) {
  requireCount(input.n)
  requireProbability(input.discordance)
  requireProbability(input.winProbability)
  requireAlpha(input.alpha)
  const discordances = binomialProbabilities(input.n, input.discordance)
  const conditional = discordances.map((_, count) => {
    const wins = binomialProbabilities(count, input.winProbability)
    const key = `${count}:${input.alpha}`
    const indices =
      rejected.get(key) ??
      wins.flatMap((_, treatmentOnly) =>
        exactMcNemar({ baselineOnly: count - treatmentOnly, treatmentOnly }) <= input.alpha ? [treatmentOnly] : [],
      )
    rejected.set(key, indices)
    return {
      mass: wins.reduce((sum, value) => sum + value, 0),
      reject: indices.reduce((sum, index) => sum + wins[index]!, 0),
    }
  })
  return {
    ...input,
    expectedDifference: input.discordance * (2 * input.winProbability - 1),
    power: Math.min(
      1,
      discordances.reduce((sum, value, index) => sum + value * conditional[index]!.reject, 0),
    ),
    probabilityMass: discordances.reduce((sum, value, index) => sum + value * conditional[index]!.mass, 0),
  }
}

export function zeroEventUpperBound(n: number, alpha: number) {
  requireCount(n)
  requireAlpha(alpha)
  if (n === 0) throw new Error("A zero-event bound requires at least one independent observation")
  return -Math.expm1(Math.log(alpha) / n)
}

export function designSensitivity() {
  const grid = {
    n: [48, 96, 192],
    discordance: [0.1, 0.25, 0.5],
    winProbability: [0.5, 0.65, 0.75, 0.85],
    alpha: [0.05, 0.0125],
  }
  return {
    kind: "hypothetical-design-sensitivity-not-empirical-results",
    independentUnit: "matched task pair, not trajectory or repeated run",
    method:
      "Exact enumeration: D ~ Binomial(n, q); W | D ~ Binomial(D, p); reject two-sided exact McNemar at p-value <= alpha",
    assumptions: [
      "All q and p values are hypothetical design assumptions; no pilot outcomes or labels are read or fitted.",
      "Task pairs are independent and identically distributed; repository/task dependence can invalidate this power model.",
      "alpha=0.0125 is a conservative sufficient rejection threshold for a four-comparison Holm family, not exact Holm joint power.",
      "n=96 and n=192 are hypothetical independent task counts, not approved expansions or reinterpretations of repeated trajectories.",
      "384 trajectories do not imply 384 independent tasks. Current primary analysis has 48 task pairs and repeated runs are dependent.",
    ],
    grid,
    rows: grid.n.flatMap((n) =>
      grid.discordance.flatMap((discordance) =>
        grid.winProbability.flatMap((winProbability) =>
          grid.alpha.map((alpha) => exactMcNemarPower({ n, discordance, winProbability, alpha })),
        ),
      ),
    ),
    zeroEventBounds: [42, 126].map((n) => ({ n, alpha: 0.05, confidence: 0.95, upper: zeroEventUpperBound(n, 0.05) })),
    zeroEventCaveat:
      "Hypothetical zero events only. n=42 is an illustrative independent-observation count, not an expected or guaranteed class denominator. The grouped 54/126 split does not enforce 42 examples per class even when the full 180-example corpus has 60 per class. Actual STOP/DEFER risk estimates must use the realized class counts; n=126 is pooled, not a class-specific denominator. Correlated boundaries cannot be assumed independent. These are not measured safety rates or bounds for the current artifact.",
  }
}

function requireCount(n: number) {
  // The grid is small; bound the domain to keep the existing exact McNemar arithmetic finite.
  if (!Number.isSafeInteger(n) || n < 0 || n > 512)
    throw new Error("Independent count must be an integer from 0 to 512")
}

function requireProbability(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Probability must be finite and within [0, 1]")
}

function requireAlpha(alpha: number) {
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1)
    throw new Error("Significance level must be finite and within (0, 1)")
}
