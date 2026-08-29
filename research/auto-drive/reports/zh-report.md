# AutoDrive 长程编码智能体续推控制研究报告

## 摘要

AutoDrive 面向一种具体失败：编码智能体完成了当前模型回合，却在用户任务尚未完成时过早把会话交还给用户，导致用户反复输入“继续”。系统只在安全回合边界决策，并输出 `continue | stop | defer`。其中，涉及主观选择、缺失信息、权限扩大、危险操作或外部副作用时必须 `defer`。

当前交付已完成系统实现、持久化恢复、V2 接口、客户端/UI、浏览器回归、冻结评测协议和论文草稿。付费轨迹与双人标注尚未执行，因此本文不报告任何效果数字，也不把空结果解释为零提升。

## 创新边界

本研究不声称首次提出 supervisor、memory、agent termination、abstention 或循环防护。候选创新被限定为：将单一编码 worker 的终止回合与 Session 任务完成分离；在回合边界使用三态安全决策；并把续推决策以确定 input ID 先持久化、后入队，从而在崩溃窗口内恢复且不重复 admission。

与 Magentic-One 的多智能体编排相比，AutoDrive 不负责跨专家分工；与 Agentic Abstention 相比，它关注安全工作仍然存在时的过早让渡；与 Evidence-Carrying Termination 相比，它不证明完成声明的外部真实性；与 Infinite Agentic Loops 相比，它提供有界运行时控制而不是静态循环检测。

## 系统设计

控制器与仓库 Location 绑定，Session 保存开关、policy、最大续推次数、控制器模型、contextual 选项和 memory。Session 配置优先于项目配置，项目配置优先于内置默认。真实用户 steer/queue 始终优先，并开启新的自动链。

每次 `continue` 先记录 `auto-drive.decided` 事件，其中包含 chain、continuation 和确定 input ID，再 admission 为 queue。重启时根据该 ID 补齐缺失 input 或复用等价 pending input；冲突则失败关闭。计数持久化，不能通过重启绕过上限。默认 memory 位于 Session 数据库，项目文件仅允许显式只读引用。

## 冻结实验

主数据集固定为 SWE-EVO 官方提交 `9b83d5af...0219` 的全部 48 个任务，Arrow 文件 SHA-256 为 `74e7c631...0520`。四个策略是 Oracle、Blind、Regex 和完整 Supervisor；关闭结果取每条付费轨迹的第一次边界前缀。

总矩阵为 384 条：Gemini 主模型 48×4=192；分层 12 任务的两个额外主模型重复为 96；Claude Sonnet 4.6 和 GPT-5.4 各 12×4=48。控制器始终固定为 Gemini 3.7 Flash。每段 6 步，最多 5 次续推，45 分钟，最多两个任务并发。

边界数据要求 180 条真实样本，三类各 60；按基础轨迹分组为 54 开发、126 冻结测试。两位标注者独立标注，Cohen's κ 不低于 0.75 才冻结。当前标注状态为待执行，仓库中只有指南和空模板，没有伪造标签。

## 指标与统计

任务指标包括 resolved rate、Fix Rate、人工续推次数、冗余回合、token、费用、延迟和故障恢复率。边界指标包括 macro-F1、分类 F1，以及 STOP/DEFER 的错误续推率。二元成败使用 exact McNemar；连续差值使用任务级 paired bootstrap 95% CI；多重比较使用 Holm 校正。

预算上限为 800 美元，分类上限分别为 pilot 50、主实验 360、跨模型 288、边界与恢复 102。仅零费用、预定义的基础设施故障允许同配置重跑一次；模型超时、循环、预算耗尽和 provider 错误均计入失败。

## 当前结论

系统层面的结论是：三态控制、统一 Session 接口、持久计数、确定 input ID、用户抢占和 V1 显式拒绝已经有自动化证据。研究效果结论仍为待验证。论文将无论结果正面、无显著差异或负面都如实完成。
