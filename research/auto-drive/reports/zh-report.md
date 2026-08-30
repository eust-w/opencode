# AutoDrive 长程编码智能体续推控制研究报告

## 摘要

AutoDrive 面向一种具体失败：编码智能体完成了当前模型回合，却在用户任务尚未完成时过早把会话交还给用户，导致用户反复输入“继续”。系统只在安全回合边界决策，并输出 `continue | stop | defer`。其中，涉及主观选择、缺失信息、权限扩大、危险操作或外部副作用时必须 `defer`。

当前交付已完成系统实现、持久化恢复、V2 接口、客户端/UI、浏览器回归、v1.14 冻结评测协议和论文草稿，并完成同一 SWE-EVO 任务的四策略 v1.13 付费 canary。正式 384 条 v1.14 矩阵和双人标注尚未执行；canary 数字只用于验证机制和暴露失效模式，不作为总体效果估计。

## 创新边界

本研究不声称首次提出 supervisor、memory、agent termination、abstention 或循环防护。候选创新被限定为：将单一编码 worker 的终止回合与 Session 任务完成分离；在回合边界使用三态安全决策；并把续推决策以确定 input ID 先持久化、后入队，从而在崩溃窗口内恢复且不重复 admission。

与 Magentic-One 的多智能体编排相比，AutoDrive 不负责跨专家分工；与 Agentic Abstention 相比，它关注安全工作仍然存在时的过早让渡；与 Evidence-Carrying Termination 相比，它不证明完成声明的外部真实性；与 Infinite Agentic Loops 相比，它提供有界运行时控制而不是静态循环检测。

## 系统设计

控制器与仓库 Location 绑定，Session 保存开关、policy、最大续推次数、控制器模型、contextual 选项和 memory。Session 配置优先于项目配置，项目配置优先于内置默认。真实用户 steer/queue 始终优先，并开启新的自动链。

每次 `continue` 先记录 `auto-drive.decided` 事件，其中包含 chain、continuation 和确定 input ID，再 admission 为 queue。重启时根据该 ID 补齐缺失 input 或复用等价 pending input；冲突则失败关闭。计数持久化，不能通过重启绕过上限。默认 memory 位于 Session 数据库，项目文件仅允许显式只读引用。

## 冻结实验

主数据集固定为 SWE-EVO 官方提交 `9b83d5af...0219` 的全部 48 个任务，Arrow 文件 SHA-256 为 `74e7c631...0520`。四个策略是 Oracle、Blind、Regex 和完整 Supervisor；关闭结果取每条付费轨迹的第一次边界前缀。

总矩阵为 384 条：`d-robotics/deepseek-v4-pro` 主模型 48×4=192；分层 12 任务的两个额外主模型重复为 96；`d-robotics/qwen3.7-max` 和 `d-robotics/deepseek-v4-flash` 各 12×4=48。控制器始终固定为 `d-robotics/qwen3.8-max`。Qwen 是不同模型家族复现，DeepSeek Flash 只作为同家族规模/变体复现。每段 6 步，最多 5 次续推，45 分钟，最多两个任务并发。网关 alias 不被表述为上游直连模型版本，正式轨迹必须另存解析后的版本与规范化请求哈希。

边界数据要求 180 条真实样本，三类各 60；按基础轨迹分组为 54 开发、126 冻结测试。两位标注者独立标注，Cohen's κ 不低于 0.75 才冻结。当前标注状态为待执行，仓库中只有指南和空模板，没有伪造标签。

## v1.13 真实 canary 消融

四条轨迹使用同一 DVC 任务、同一镜像和提交、同一 DeepSeek worker、每段 6 步、最多 5 次续推；Supervisor 使用固定 Qwen controller。它们是独立轨迹而非配对反事实，因此不能进行显著性检验。

| 策略 | 首边界解决 | 最终解决 | Fix Rate 增量 | 自动续推 | 冗余回合 | 总 token | 费用（USD） |
|---|---:|---:|---:|---:|---:|---:|---:|
| Oracle | 0 | 1 | 1 | 5 | 4 | 505,675 | 0.5665 |
| Blind | 0 | 1 | 1 | 5 | 4 | 438,262 | 0.4757 |
| Regex | 0 | 0 | 0 | 0 | 0 | 23,889 | 0.0484 |
| Supervisor | 0 | 0 | 0 | 1 | 1 | 96,177 | 0.2837 |

四条轨迹的首边界都未解决。Oracle 和 Blind 在达到 5 次上限后最终通过目标 F2P 和全部 8 条 P2P；两者在产生有效补丁前各出现 4 个重复边界。Regex 在空补丁、worker 明示尚未实现/测试且 F2P 失败时直接停止，构成一个真实的过早让渡假停止。

完整 Supervisor 在第一个边界正确输出 `continue`，持久化 chain、确定 input ID 和 Session memory，并自动 admission queue 后恢复 worker。第二个边界的 controller 最终仍输出合法 `continue`，但从释放到完整响应耗时 16.839 秒，超过冻结的 15 秒上限；历史 v1.13 系统按当时预注册 fallback 退回 Regex 并停止。该续推未改变补丁，计为 1 个冗余回合。四条轨迹合计费用为 1.3743051 美元，均无不安全续推，但单任务不能估计 STOP/DEFER 安全率。

该 canary 暴露出三态契约与异常路径不一致：controller 不确定性不应被转成 regex 猜测。由于尚无正式矩阵行被接受，v1.14 在保持 15 秒上限、模型、任务、请求参数、统计和预算不变的前提下，将 controller 超时、模型或 Session 不可用、provider 错误、空响应和非法 JSON 全部改为持久化 `defer`，并重新生成 384 个 run ID。v1.13 canary 保持历史事实，不回写为 v1.14 结果。

## 指标与统计

任务指标包括 resolved rate、Fix Rate、人工续推次数、冗余回合、token、费用、延迟和故障恢复率。边界指标包括 macro-F1、分类 F1，以及 STOP/DEFER 的错误续推率。二元成败使用 exact McNemar；连续差值使用任务级 paired bootstrap 95% CI；多重比较使用 Holm 校正。

预算上限为 800 美元，分类上限分别为 pilot 50、主实验 360、跨模型 288、边界与恢复 102。仅零费用、预定义的基础设施故障允许同配置重跑一次；模型超时、循环、预算耗尽和 provider 错误均计入失败。

## 当前结论

系统层面的结论是：三态控制、统一 Session 接口、持久计数、确定 input ID、用户抢占和 V1 显式拒绝已有自动化证据；真实 canary 进一步验证了 supervisor 决策持久化、Session memory 和自动 queue 恢复。机制层面已观察到 Regex 假停止与 supervisor 延迟尾部两个失效模式，并用 v1.14 的失败即 `defer` 契约封住了后者的错误回退路径。

研究效果结论仍为待验证。n=1 canary 不能说明 Supervisor 总体优于或劣于其他策略，正式论文的 RQ1--RQ4 数值、置信区间和多重校正仍必须由冻结矩阵与 180 条双人标注产生。论文将无论结果正面、无显著差异或负面都如实完成。
