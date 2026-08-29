const labels = ["continue", "stop", "defer"] as const
export type BoundaryLabel = (typeof labels)[number]

export function exactMcNemar(input: { readonly baselineOnly: number; readonly treatmentOnly: number }) {
  const discordant = input.baselineOnly + input.treatmentOnly
  if (discordant === 0) return 1
  const tail = Math.min(input.baselineOnly, input.treatmentOnly)
  const base = 0.5 ** discordant
  const probability = Array.from({ length: tail + 1 }, (_, index) => combination(discordant, index) * base).reduce(
    (sum, value) => sum + value,
    0,
  )
  return Math.min(1, 2 * probability)
}

export function pairedBootstrap(
  baseline: readonly number[],
  treatment: readonly number[],
  options: { readonly iterations?: number; readonly seed?: number } = {},
) {
  if (!baseline.length || baseline.length !== treatment.length)
    throw new Error("Paired bootstrap requires equal, non-empty task arrays")
  const iterations = options.iterations ?? 10_000
  const random = mulberry32(options.seed ?? 20_260_830)
  const differences = treatment.map((value, index) => value - baseline[index]!)
  const draws = Array.from({ length: iterations }, () => {
    const sampled = Array.from(
      { length: differences.length },
      () => differences[Math.floor(random() * differences.length)]!,
    )
    return mean(sampled)
  }).sort((a, b) => a - b)
  return {
    estimate: mean(differences),
    lower: percentile(draws, 0.025),
    upper: percentile(draws, 0.975),
    samples: iterations,
  }
}

export function holm(pValues: readonly number[]) {
  const ordered = pValues.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const corrected = new Array<number>(pValues.length)
  ordered.reduce((previous, item, index) => {
    const adjusted = Math.min(1, Math.max(previous, item.value * (ordered.length - index)))
    corrected[item.index] = adjusted
    return adjusted
  }, 0)
  return corrected
}

export function cohenKappa(first: readonly BoundaryLabel[], second: readonly BoundaryLabel[]) {
  if (!first.length || first.length !== second.length) throw new Error("Kappa requires equal, non-empty label arrays")
  const observed = first.filter((value, index) => value === second[index]).length / first.length
  const expected = labels.reduce((sum, label) => {
    const firstRate = first.filter((value) => value === label).length / first.length
    const secondRate = second.filter((value) => value === label).length / second.length
    return sum + firstRate * secondRate
  }, 0)
  if (expected === 1) return observed === 1 ? 1 : 0
  return (observed - expected) / (1 - expected)
}

export function macroF1(expected: readonly BoundaryLabel[], predicted: readonly BoundaryLabel[]) {
  if (!expected.length || expected.length !== predicted.length)
    throw new Error("Macro-F1 requires equal, non-empty label arrays")
  return mean(
    labels.map((label) => {
      const truePositive = expected.filter((value, index) => value === label && predicted[index] === label).length
      const falsePositive = expected.filter((value, index) => value !== label && predicted[index] === label).length
      const falseNegative = expected.filter((value, index) => value === label && predicted[index] !== label).length
      const denominator = 2 * truePositive + falsePositive + falseNegative
      return denominator ? (2 * truePositive) / denominator : 0
    }),
  )
}

function combination(total: number, selected: number) {
  return Array.from({ length: selected }, (_, index) => (total - index) / (index + 1)).reduce(
    (value, factor) => value * factor,
    1,
  )
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function percentile(sorted: readonly number[], probability: number) {
  const index = (sorted.length - 1) * probability
  const lower = Math.floor(index)
  const fraction = index - lower
  return sorted[lower]! + (sorted[Math.min(lower + 1, sorted.length - 1)]! - sorted[lower]!) * fraction
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    const value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    const mixed = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}
