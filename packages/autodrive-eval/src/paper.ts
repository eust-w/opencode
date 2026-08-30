import type { Task } from "./protocol"

export function renderTaskManifest(tasks: readonly Task[]) {
  if (tasks.length !== 48) throw new Error("Paper task manifest requires exactly 48 frozen tasks")
  const rows = tasks
    .map(
      (task) =>
        `% task-row\n${latex(task.repo)} & ${latex(`${task.startVersion}--${task.endVersion}`)} & ${task.failToPassCount.toLocaleString("en-US")} & ${task.passToPassCount.toLocaleString("en-US")} & ${task.pullRequestCount.toLocaleString("en-US")} \\\\`,
    )
    .join("\n")
  return `% Generated from protocol/swe-evo-48.json. Do not edit by hand.
\\begin{table*}[p]
  \\caption{Frozen 48-task manifest. FTP and PTP are the task-level failing-to-passing and passing-to-passing test counts; PR is the upstream pull-request count.}
  \\label{tab:task-manifest}
  \\centering
  \\footnotesize
  \\renewcommand{\\arraystretch}{0.85}
  \\begin{tabular}{llrrr}
    \\toprule
    Repository & Version evolution & FTP & PTP & PR \\\\
    \\midrule
${rows}
    \\bottomrule
  \\end{tabular}
\\end{table*}
`
}

function latex(value: string) {
  return value.replace(/[\\%&_#{}$~^]/g, (character) => {
    if (character === "\\") return "\\textbackslash{}"
    if (character === "~") return "\\textasciitilde{}"
    if (character === "^") return "\\textasciicircum{}"
    return `\\${character}`
  })
}
