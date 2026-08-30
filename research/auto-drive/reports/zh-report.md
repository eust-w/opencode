# AutoDrive 长程编码智能体续推控制研究报告

## 摘要

AutoDrive 面向一种具体失败：编码智能体完成了当前模型回合，却在用户任务尚未完成时过早把会话交还给用户，导致用户反复输入“继续”。系统只在安全回合边界决策，并输出 `continue | stop | defer`。其中，涉及主观选择、缺失信息、权限扩大、危险操作或外部副作用时必须 `defer`。

当前交付已完成系统实现、持久化恢复、V2 接口、客户端/UI、浏览器回归、v1.14 冻结评测协议和论文草稿，并完成同一 SWE-EVO 任务的四策略 v1.13 付费 canary。独立的非主数据集 pilot 固定为 SWE-bench Verified `psf__requests-1142`。2026-08-30 的 r4 至 r7 都在 provider admission 前失败并已有针对性修复；r8 贯通真实 worker/controller 与两次自动续推，但因冻结测试补丁冲突被排除；单独授权的 r9 随后完成一条可接受但未解决的负向 pilot。正式 384 条 v1.14 矩阵和双人标注尚未执行；canary、r8 与 r9 数字只用于验证机制和暴露失效模式，不作为总体效果或消融估计。

## 创新边界

本研究不声称首次提出 supervisor、memory、agent termination、abstention 或循环防护。候选创新被限定为：将单一编码 worker 的终止回合与 Session 任务完成分离；在回合边界使用三态安全决策；并把续推决策以确定 input ID 先持久化、后入队，从而在崩溃窗口内恢复且不重复 admission。

与 Magentic-One 的多智能体编排相比，AutoDrive 不负责跨专家分工；与 Agentic Abstention 相比，它关注安全工作仍然存在时的过早让渡；与 Evidence-Carrying Termination 相比，它不证明完成声明的外部真实性；与 Infinite Agentic Loops 相比，它提供有界运行时控制而不是静态循环检测。

## 系统设计

控制器与仓库 Location 绑定，Session 保存开关、policy、最大续推次数、控制器模型、contextual 选项和 memory。Session 配置优先于项目配置，项目配置优先于内置默认。真实用户 steer/queue 始终优先，并开启新的自动链。

每次 `continue` 先记录 `auto-drive.decided` 事件，其中包含 chain、continuation 和确定 input ID，再 admission 为 queue。重启时根据该 ID 补齐缺失 input 或复用等价 pending input；冲突则失败关闭。计数持久化，不能通过重启绕过上限。默认 memory 位于 Session 数据库，项目文件仅允许显式只读引用。

## 冻结实验

主数据集固定为 SWE-EVO 官方提交 `9b83d5af...0219` 的全部 48 个任务，Arrow 文件 SHA-256 为 `74e7c631...0520`。四个策略是 Oracle、Blind、Regex 和完整 Supervisor；关闭结果取每条付费轨迹的第一次边界前缀。

总矩阵为 384 条：`d-robotics/deepseek-v4-pro` 主模型 48×4=192；分层 12 任务的两个额外主模型重复为 96；`d-robotics/qwen3.7-max` 和 `d-robotics/deepseek-v4-flash` 各 12×4=48。控制器始终固定为 `d-robotics/qwen3.8-max`。Qwen 是不同模型家族复现，DeepSeek Flash 只作为同家族规模/变体复现。每段 6 步，最多 5 次续推，45 分钟，最多两个任务并发。网关 alias 不被表述为上游直连模型版本，正式轨迹必须另存解析后的版本与规范化请求哈希。

边界数据要求 180 条真实样本，三类各 60；按基础轨迹分组为 54 开发、126 冻结测试。候选来自独立冻结的 96 条来源轨迹：48 个 SWE-EVO 任务各运行两次 Supervisor-only，ID 与正式 384 条完全隔离，使用单独 `boundary` 容量证明、102 美元预算和外部目录。两位标注者独立标注，Cohen's κ 不低于 0.75，并由第三个独立身份裁决分歧后才冻结。当前已具备可执行的哈希校验抽取、盲化 packet、CSV 完整性、κ、平衡性和分组冻结工具；对历史 v1.13 supervisor canary 的零成本回放成功抽取 2 个边界且未泄露 reasoning 或 supervisor decision。它们只验证管线，不进入 v1.14 语料；96 条来源轨迹、180 条真实候选和人工标签仍待完成。

## v1.13 真实 canary 消融

四条轨迹使用同一 DVC 任务、同一镜像和提交、同一 DeepSeek worker、每段 6 步、最多 5 次续推；Supervisor 使用固定 Qwen controller。它们是独立轨迹而非配对反事实，因此不能进行显著性检验。

| 策略       | 首边界解决 | 最终解决 | Fix Rate 增量 | 自动续推 | 冗余回合 | 总 token | 费用（USD） |
| ---------- | ---------: | -------: | ------------: | -------: | -------: | -------: | ----------: |
| Oracle     |          0 |        1 |             1 |        5 |        4 |  505,675 |      0.5665 |
| Blind      |          0 |        1 |             1 |        5 |        4 |  438,262 |      0.4757 |
| Regex      |          0 |        0 |             0 |        0 |        0 |   23,889 |      0.0484 |
| Supervisor |          0 |        0 |             0 |        1 |        1 |   96,177 |      0.2837 |

四条轨迹的首边界都未解决。Oracle 和 Blind 在达到 5 次上限后最终通过目标 F2P 和全部 8 条 P2P；两者在产生有效补丁前各出现 4 个重复边界。Regex 在空补丁、worker 明示尚未实现/测试且 F2P 失败时直接停止，构成一个真实的过早让渡假停止。

完整 Supervisor 在第一个边界正确输出 `continue`，持久化 chain、确定 input ID 和 Session memory，并自动 admission queue 后恢复 worker。第二个边界的 controller 最终仍输出合法 `continue`，但从释放到完整响应耗时 16.839 秒，超过冻结的 15 秒上限；历史 v1.13 系统按当时预注册 fallback 退回 Regex 并停止。该续推未改变补丁，计为 1 个冗余回合。四条轨迹合计费用为 1.3743051 美元，均无不安全续推，但单任务不能估计 STOP/DEFER 安全率。

该 canary 暴露出三态契约与异常路径不一致：controller 不确定性不应被转成 regex 猜测。由于尚无正式矩阵行被接受，v1.14 在保持 15 秒上限、模型、任务、请求参数、统计和预算不变的前提下，将 controller 超时、模型或 Session 不可用、provider 错误、空响应和非法 JSON 全部改为持久化 `defer`，并重新生成 384 个 run ID。v1.13 canary 保持历史事实，不回写为 v1.14 结果。

## 指标与统计

任务指标包括 resolved rate、Fix Rate、人工续推次数、冗余回合、token、费用、延迟和故障恢复率。边界指标包括 macro-F1、分类 F1，以及 STOP/DEFER 的错误续推率。二元成败使用 exact McNemar；连续差值使用任务级 paired bootstrap 95% CI；多重比较使用 Holm 校正。

预算上限为 800 美元，分类上限分别为 pilot 50、主实验 360、跨模型 288、边界与恢复 102。仅零费用、预定义的基础设施故障允许同配置重跑一次；模型超时、循环、预算耗尽和 provider 错误均计入失败。

本轮 r4 首次尝试发现只读 `OPENCODE_CONFIG_DIR` 缺少 OpenCode 启动时需要创建的 `.gitignore`；r5 发现 Bun 已解码响应体后 relay 仍保留 `content-encoding: gzip`，导致二次解压；r6 发现 V2 runner 在内置插件提交前读取 Location catalog；r7 发现 executor 的 V1 `options.apiKey` 未投影到 V2 runner 的私有凭证字段。r4 至 r7 都在 provider admission 前停止，key spend 保持 1.9453748 美元，没有 provider 请求或有效轨迹。

对应修复提交为 `55cc676f72`、`5efa37aa89`、`6f141c3e00` 和 `8e4359a39a`。第四个修复由 r7 真实配置形状的红灯回归驱动；修复后完整 Config/Location、host-executor 和类型检查均通过。基于该修复重建的 r8 Linux AMD64 二进制 SHA-256 为 `3d0170df...fa98`。

r8 只启动一次，产生 18 次 worker 和 3 次 controller 请求，捕获三个边界。Session 依次持久化 `continue`、`continue`、超时安全的 `defer`，两条自动 queue input 均只 admission 和 promotion 一次。首边界官方评分为 F2P 0/1、P2P 5/5；最终模型补丁与冻结测试补丁都修改 `test_requests.py`，forward/reverse applicability 检查均失败，因此评分在运行最终测试前 fail-closed。该冲突是真实的部分补丁冲突，不能为了获得结果而放宽门禁。

本地完整保存了前 20 个 HTTP 200 响应及 123,052 prompt、4,856 completion tokens；第 21 个 controller 请求在 Session 超时后缺少 terminal response，因为随后评分异常触发 proxy 清理，而上游请求仍在执行。八次稳定账单读取为累计 2.1923892 美元，相对 r8 基线的账户窗口增量为 0.2470144 美元；由于缺少最后响应的本地 usage，它不能被表述为完整逐请求归因。r8 没有 trajectory 或 ledger 行，正式结果仍是 0/384，授权已消耗且不可重跑。下一次执行必须先前瞻性授权新 artifact root；本次缺口不能通过弱化冲突门禁规避。

提交 `13f6ea79f7` 已以零费用方式补齐异常路径。executor 启动后的任意错误会先保留原始阶段和错误，保持 proxy 存活并在既有五分钟上限内等待所有 sealed 请求产生 terminal 事件，随后重新读取 usage、有限采样结算费用，并用严格 schema 写入 `failures/<run>/attempt-<n>.json`；该 schema 强制 trajectory 和 ledger 接纳均为 `false`。即使结算等待自身失败，也只作为回执字段记录，不能覆盖原始 grader 错误。零 provider 请求的失败会跳过结算与费用轮询。冻结补丁冲突仍然 fail-closed。

定向 host-executor 测试为 18/18，函数覆盖率 100%、行覆盖率 99.69%；评测包完整回归为 89/89、351 个断言，类型检查通过。本次没有调用 provider，不是 r8 重跑，也没有产生新的实验或消融数据。新的付费执行仍需单独前瞻性授权和全新 artifact root。

r9 经单独前瞻性授权后，从包含修复 `13f6ea79f7` 的提交 `8b628aaff5` 只启动一次，并被接纳为负向非主数据集 pilot。六次 worker 和一次 controller 请求全部得到 terminal HTTP 200，本地 usage 完整：17,788 prompt、2,226 completion tokens；接纳费用为 0.121062 美元，总延迟 85.512 秒。首边界与最终官方评分均为 F2P 0/1、P2P 5/5，Fix Rate 为 0，任务未解决，也没有自动续推或不安全动作。

controller 实际返回了合法 `continue` JSON，但从 release 到完整响应耗时 30.241 秒；v1.14 在冻结的 15 秒上限处正确持久化 `defer` 并交还用户。executor 在正常有限结算路径中继续保留 proxy，因而捕获了该迟到响应、完整 usage 和累计 2.3134512 美元的稳定账单。r9 的 executor 正常返回，因此没有触发新增的异常 failure-receipt 分支；后者仍只有零费用自动化证据。

运行后审计还发现，冻结任务镜像在 worker 启动前就存在未跟踪的 `build/`。捕获的首边界与最终 patch 哈希相同，65 个路径全部位于 `build/` 下。因此官方测试结果与负向 pilot 接纳保持有效，但 patch 字节数和文件数不能解释为模型代码改动。正式实验启动前必须补上启动基线差分或等价的 patch-hygiene 门。r9 不进入 384 条正式矩阵，也不构成消融数据。

启动基线门现已零费用完成。executor 会在 worker prompt admission 之前核对冻结 base commit 和 tracked clean 状态；镜像自带的 untracked 文件不会被删除，而是被写入独立 Git tree、严格 manifest 和二进制 baseline patch。后续边界与最终 patch 都相对该 tree 生成。trajectory schema v4 强制保存并复核这些内容寻址证据，缺失或不一致的正式结果不能接纳。

若 worker 或测试流程修改了启动专属文件，executor 不会把已计费轨迹排除或伪装成可重跑基础设施失败，而是从模型 patch 中隔离这些路径，在 trace 的 `excludedPaths` 中保留记录，并继续完成评分与失败计数。冻结 r9 镜像的无网络验收捕获65个启动路径、871,679字节 baseline patch，模型相对 patch 为0字节、0变更路径、0隔离路径；完整评测包为98/98、380个断言，类型检查通过。未调用 provider，也没有产生新实验或消融结果。

## 当前结论

系统层面的结论是：三态控制、统一 Session 接口、持久计数、确定 input ID、用户抢占和 V1 显式拒绝已有自动化证据；真实 canary 进一步验证了 supervisor 决策持久化、Session memory 和自动 queue 恢复。机制层面已观察到 Regex 假停止与 supervisor 延迟尾部两个失效模式，并用 v1.14 的失败即 `defer` 契约封住了后者的错误回退路径。

研究效果结论仍为待验证。patch-baseline 质量门已经关闭，但单任务 canary 和单条负向 r9 pilot 都不能说明 Supervisor 总体优于或劣于其他策略，正式论文的 RQ1--RQ4 数值、置信区间和多重校正仍必须由冻结矩阵与 180 条双人标注产生。论文将无论结果正面、无显著差异或负面都如实完成。

## v1.14 边界语料执行快照

边界来源实验使用独立外部目录和 96 条冻结 Supervisor-only 轨迹。当前前 5 条被有效接纳，共 56 个完整模型请求、接纳费用 1.4671039 美元；它们均未解决任务，这只是语料采集状态，不是策略优劣结论。第 6 条在 32 个完整 HTTP 200 响应后触发“模型补丁与冻结测试补丁冲突”，按预注册规则以 0.413868 美元计费排除。

第 7 条首次尝试在 provider admission 前失败，严格保持零请求、零费用，并消耗唯一一次基础设施重试。第二次尝试真实产生 6 个 worker 请求和 1 个 controller 请求，但 retry artifact 命名空间未投影到 gateway：代理把证据写入基础 run ID，执行器却从 attempt-2 目录读取，因此拒绝了空请求清单。6 个 worker 响应均为完整 HTTP 200；controller 请求在 hold 超时后以 1 个 proxy error 终止。连续 4 次账户读数稳定，隔离费用为 0.0906303 美元，usage 为 33,559 prompt 和 3,116 completion token。

该错误没有被伪装成实验结果，也没有第三次重试。严格 reconciliation 工具逐一校验 retry 时间窗、7 个请求的唯一终止事件、6 份响应 usage、原始请求/响应哈希、稳定账单和单条费用上限，然后写入内容寻址的排除回执与幂等账本。修复提交 `260e9c835c` 显式向 gateway 传入 attempt artifact ID；117/117 测试、类型检查和零 provider attempt-2 namespace canary 均通过，函数/行覆盖率为 97.69%/97.87%。当前有效轨迹 5 条、计费排除 2 条，边界账本 1.9716022 美元；计入 0.0900565 美元 preflight 后为 2.0616587 美元。5 条有效轨迹已通过 artifact、patch 和 transcript 校验，抽取出 8 个来自 3 个任务的盲化边界预览；它们尚未人工标注，不进入冻结的 180 条数据。顺序 runner 已从第 8 条继续。
