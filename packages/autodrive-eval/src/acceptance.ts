import type { Trajectory } from "./artifact"
import type { Preflight } from "./preflight"
import { protocol, type Run, type Task } from "./protocol"

export function assertTrajectoryProvenance(
  trajectory: Trajectory,
  context: {
    run: Run
    task: Pick<Task, "instanceID" | "image" | "baseCommit">
    preflight: { receipt: Preflight; sha256: string }
  },
) {
  if (trajectory.schemaVersion !== 4) throw new Error("Formal trajectories require schema version 4")
  if (trajectory.environment.startupBaseline.head !== context.task.baseCommit)
    throw new Error("Trajectory startup baseline HEAD does not match the frozen task")
  if (trajectory.runID !== context.run.id) throw new Error("Trajectory does not match the frozen run ID")
  if (trajectory.taskID !== context.run.taskID || trajectory.taskID !== context.task.instanceID)
    throw new Error("Trajectory does not match the frozen task")
  if (
    trajectory.model !== context.run.model ||
    trajectory.controllerModel !== context.run.controllerModel ||
    trajectory.strategy !== context.run.strategy ||
    trajectory.repeat !== context.run.repeat
  )
    throw new Error("Trajectory does not match the frozen run configuration")
  if (trajectory.environment.image !== context.task.image) throw new Error("Trajectory task image does not match")
  if (trajectory.environment.baseCommit !== context.task.baseCommit)
    throw new Error("Trajectory base commit does not match")
  if (trajectory.preflight.sha256 !== context.preflight.sha256)
    throw new Error("Trajectory does not reference the sealed preflight receipt")
  if (trajectory.environment.modelMetadata.sha256 !== context.preflight.receipt.modelMetadata.sha256)
    throw new Error("Trajectory model metadata does not match the sealed preflight")
  if (new Date(trajectory.endedAt).getTime() < new Date(trajectory.startedAt).getTime())
    throw new Error("Trajectory ends before it starts")
  if (!trajectory.modelRequests.some((request) => request.kind === "worker"))
    throw new Error("Trajectory must contain at least one worker request")

  trajectory.modelRequests.forEach((request) => {
    const model = request.kind === "worker" ? context.run.model : context.run.controllerModel
    const separator = model.indexOf("/")
    const sealed = context.preflight.receipt.models.find((item) => item.model === model)
    if (!sealed) throw new Error(`${model} is not present in the sealed preflight`)
    const provider =
      model.slice(0, separator) === protocol.gateway.logicalProvider
        ? protocol.gateway.requestProvider
        : model.slice(0, separator)
    if (request.provider !== provider || request.modelID !== model.slice(separator + 1))
      throw new Error(`Trajectory ${request.kind} request does not match ${model}`)
    if (request.modelVersion !== sealed.modelVersion)
      throw new Error(`Trajectory ${request.kind} model version does not match the sealed preflight`)
  })
}
