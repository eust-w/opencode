# AutoDrive 介绍片事实映射

核对日期：2026-10-25。依据为公开研究预览提交 `924f024e7ad425f35818fe04d41c0a6e5ae45782` 中的实现与研究文档。本文区分“代码中的规则”“实际执行保证”“已验证科研效果”，三者不能互换。

旁白来源：[narration.json](narration.json)。批准方向：[视频设计](../../../../docs/plans/2026-10-25-autodrive-video-design.md)。下表覆盖每个场景的实质主张；影片为说明性动画，不伪装成测量数据或运行录像。

| 场景 / 可用表述 | 可核验依据 | 解释边界 |
| --- | --- | --- |
| hook / “一个回合结束，不等于任务已经完成。” | [runner 在 worker 轮次结束后另行决定是否续推](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/runner/llm.ts#L503-L550)；[README 的研究状态](../../README.md#current-state) | 这是研究动机与控制流程，不声称已测得自然过早停止的发生率。开头提问是情境示例，不是假造用户证言。 |
| intro / “研究这个回合边界：继续、停止、交还用户。” | [Action 三态](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/auto-drive.ts#L17-L27)；[supervisor 决策规则](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/auto-drive.ts#L152-L165) | 描述本实现，不主张首次提出监督器、记忆、停止判断或防循环。 |
| layer / “不是新基础模型，是基于 OpenCode 的续推控制原型。” | [当前研究预览说明](../../releases/2026-10-25.md)；[Location-scoped controller 服务](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/auto-drive-controller.ts#L39-L48) | 不是 OpenCode 上游官方发布或新的训练模型；不暗示上游背书。 |
| continue / “任务未完成，下一步明确且在授权范围内，选择继续。” | [supervisor 规则 1](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/auto-drive.ts#L152-L156) | 是提示规则与目标行为，分类可能出错，不是权限安全证明。控制器输出不能自动创造新的用户授权。 |
| stop / “已完成，或不再需要继续，选择停止。” | [supervisor 规则 2](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/auto-drive.ts#L152-L155)；[上限强制转 stop](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/auto-drive-controller.ts#L84-L102) | stop 也可能由计数上限、无续推信号等产生，不等同外部测试证实任务成功。 |
| defer / “缺信息、需要选择或扩大权限，交还用户。” | [规则 3](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/auto-drive.ts#L152-L157)；[超时及错误 fallback](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/runner/llm.ts#L537-L548) | 不宣称所有危险行为必能识别；不是“零误续推”。defer 也涵盖监督器不可用等技术失败。 |
| queue / “先记入会话，需要续推再入持久队列。” | [decide 先 record 再 reconcile](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/auto-drive-controller.ts#L84-L137)；[数据库投影](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/projector.ts#L377-L390)；[SessionInput admission](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/input.ts#L45-L87) | continue 才产生 queue 输入。持久 admission 与模型执行/外部工具副作用不是同一件事；不得宣传所有操作恰好执行一次。 |
| priority / “用户的引导输入，在安全边界优先接入。” | [初始 steer 优先选择](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/runner/llm.ts#L492-L518)；[每轮边界的 steer promotion](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/runner/llm.ts#L196-L205) | 优先语义是 steer 输入与已有 queue 在相应边界的处理；不是立即中断、撤销已执行操作或让所有用户 queue 越过既有队列。queue 本身按 admitted_seq FIFO，见 [promoteNextQueued](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/input.ts#L289-L308)。 |
| priority / “每条自动续推链，都有明确的次数上限。” | [每链持久计数和 maxRuns 检查](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/auto-drive-controller.ts#L84-L106)；[默认 5 次且默认关闭](https://github.com/eust-w/opencode/blob/924f024e7ad425f35818fe04d41c0a6e5ae45782/packages/core/src/session/auto-drive-state.ts#L7-L17) | 是单自动链的上限；新的用户链与内部模型/工具步数另有语义。不能把有限续推等同绝不循环、绝不超时或费用已获控制。 |
| goal / “目标是少重复输入继续，同时保留人的控制权。” | [研究 README 对人工、安全端点的限制](../../README.md#current-state)；[准备度报告的缺失证据](../../reports/journal-readiness-2026-10-03.md#距离结果型顶刊论文还缺什么) | 必须保留“目标 / 待验证”，不能改成已观察的人工节省、效率提升或用户研究结论。 |
| evidence / “代码、评测工具、论文草稿公开；完整对比与消融尚未完成。” | [公开分支](https://github.com/eust-w/opencode/tree/auto-drive-engine)；[公开研究预览](https://github.com/eust-w/opencode/releases/tag/autodrive-research-preview-2026-10-25)；[release 研究状态](../../releases/2026-10-25.md#research-status)；[README 状态表](../../README.md#current-state) | “尚未完成”不等于目前正在运行；远端状态未做新的完整审计。48 任务 / 384 轨迹是研究计划，不能作为完成数量。单元测试和历史 canary 不是正式研究结果。 |
| limits / “机制示意，不是性能跑分或已发表论文成果。” | [release 定位与 PDF 占位说明](../../releases/2026-10-25.md#research-status)；[论文准备度](../../reports/journal-readiness-2026-10-03.md) | 草稿 PDF / arXiv 源包的存在不等于投稿、公开挂网、同行评审或接收。当前依赖告警也未关闭，不适合宣传生产级安全。 |
| outro / “欢迎查看项目、复现实验与审视边界。” | [复现说明](../../REPRODUCING.md)；[项目分支](https://github.com/eust-w/opencode/tree/auto-drive-engine) | 是参与邀请，不声称第三方已复现。付费执行仍受协议与预算门槛约束，不引导用户无约束启动。 |

## 录制前的精度修订

1. 将宽泛的“用户的新输入优先处理”收窄为“用户的引导输入，在安全边界优先接入”。理由：真实用户 queue 与自动 queue 没有独立的 source 优先排序，不能宣传全部用户输入均绝对抢占。
2. 将“完整对比与消融实验仍在进行”改成“完整对比与消融实验尚未完成”。理由：现有证据支持未完成，不支持当下远端任务持续运行。
3. 将“自动续推有次数上限，不能无限循环”收窄为“每条自动续推链，都有明确的次数上限”。理由：单链计数上限不是对整个会话、工具行为或循环故障的全面保证。

这三项仅修正宣传精度，不改产品实现、不更改冻结实验，也不表示启动新实验。制作方应核对最终 narration、SRT、烧录字幕和平台文案一致。

## 不得出现的宣传主张

- “成功率提升 X%”“人工减少 X%”“模型更聪明了”——没有完整正式结果支撑。
- “绝对安全”“零风险”“永不重复执行”“崩溃后所有操作恰好执行一次”——超出当前机制与证据范围。
- “已完成 384 条正式实验 / 180 条人类专家金标准”——计划和模型面板均不能改称已完成的人类研究。
- “首创 supervisor / memory / agent termination”“顶刊成果”“arXiv 已发表”——当前来源不支持。
- 真实密钥、服务器地址、私有账户、未脱敏请求或私人机器路径——不进入画面、旁白、字幕、简介或封面。

## 验收连接

平台文案：[platform-copy.md](platform-copy.md)。实际制作结果与发布状态由主制作流程单独记录；本文的源码核对不是音视频验收，也不是发布成功凭据。
