# AutoDrive Real-Context Worker Compatibility Ablation

## Method

This paid qualification replays the exact normalized sixth-turn input from accepted negative run `adr_6288478d42f39e0215e1`. Every terminal probe fixes temperature 0, `reasoning: {"effort":"low"}`, no tools, and 4,096 maximum output tokens. Only the worker model changes. Candidates that terminate are separately tested on the exact first-turn request with all 11 tools; passing requires a completed response and a function call with a non-empty call ID and serialized arguments.

These records measure transport and termination compatibility. They are not task-quality, continuation-policy, or boundary-label outcomes.

## Results

| Model | Terminal probe | Latency | Usage | Tool probe |
|---|---:|---:|---:|---:|
| `deepseek-v4-pro` | completed | 9.00 s | 5,269 / 602 | completed `bash` call |
| `qwen3.7-max` | completed | 21.43 s | 5,185 / 1,585 | completed `bash` call |
| `deepseek-v4-flash` | completed | 5.70 s | 5,269 / 658 | completed `bash` call |
| `qwen3.8-max` | no terminal event | 62.11 s | incomplete | not advanced |
| `glm-5.2` | `response.failed` | 0.15 s | unavailable | not advanced |
| `glm-5.3` | HTTP 400 | 0.63 s | unavailable | not advanced |
| `kimi-k3` | HTTP 400 | 0.21 s | unavailable | not advanced |

GLM 5.2 failed because an earlier function-call argument in the replayed context was an object where its adapter required a serialized string. GLM 5.3 and Kimi K3 resolved through the catalog but their upstream adapters rejected the selected model IDs. Qwen 3.8 repeated the long reasoning stream without a terminal event even under the 4,096-token cap.

## Decision

`deepseek-v4-pro` is the compatible primary-worker candidate. `qwen3.7-max` provides one different-family replication candidate. `deepseek-v4-flash` provides a second compatible, lower-latency replication candidate but belongs to the same model family as the primary; the paper must label it as a scale/variant replication rather than independent family generalization.

The probes settled from USD 3.8946965 to USD 4.1125655, a USD 0.217869 pilot cost. All raw requests and responses are retained under `artifacts/`, verified by `checksums.sha256`; the remote archive SHA-256 is `2af01a02628b116d220b1b6f76c2fa0b38b19c4afefdc89ee2b2f4de04f3acee`.
