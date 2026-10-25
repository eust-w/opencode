# AutoDrive 六平台发布文案

日期：2026-10-25。用途：用户已确认的约 90 秒中文配音介绍片；横屏、竖屏分别排版。以下是待发布文案，不是已经发布的记录。各平台账号须先确认，视频须通过画面、声音和字幕验收；时长以最终文件为准。

统一事实边界：AutoDrive 是基于 OpenCode 的回合边界续推控制研究原型，不是新的基础模型；正式对比与消融结果尚未完成。片中是机制示意，不是真实任务运行录像。旁白为合成配音，没有冒充真人。不能把单元测试通过写成性能提升、安全保证或论文已发表。

文案内的项目链接指向 `auto-drive-engine` 分支，避免默认分支不含相关更新。若平台不支持外链，保留可搜索的仓库名 `eust-w/opencode` 和分支名；不采用规避审核的跳转、暗号或诱导私信。

## 1. B站：面向开发者的机制解释

**素材**：横屏版与横屏封面。分类根据当前投稿界面选择与编程/科技知识最接近的项，不假定分类名称长期不变。

**标题**：AI 编程总要你说“继续”？90 秒看懂 AutoDrive

**简介**：

一个回合结束，不等于任务已经完成。但“让 AI 一直跑”也不是答案。

AutoDrive 是基于 OpenCode 的研究原型：在回合边界区分 CONTINUE（继续）、STOP（停止）和 DEFER（交还用户）。先记录决定，再把续推输入放入持久队列；用户引导输入在安全边界优先接入，每条自动续推链都有次数上限。

这期用机制动画解释设计，不展示虚构跑分。代码、评测工具和论文草稿已公开；完整对比与消融实验尚未完成，不能据此宣称成功率提升、节省了多少人工或零风险。

代码分支：https://github.com/eust-w/opencode/tree/auto-drive-engine

研究预览与论文草稿：https://github.com/eust-w/opencode/releases/tag/autodrive-research-preview-2026-10-25

本片使用合成中文配音与机制示意动画；不是实际任务录像，也不是已发表论文成果。研究预览版仍有未解决的依赖告警，不代表生产可用或安全认证。

**标签候选**：AI编程、智能体、开源、OpenCode、软件工程、AutoDrive。按投稿界面的标签上限择取，不堆无关热门词。

**讨论引导**：你遇到过哪种“任务没完，对话先停了”？什么情况下你更希望智能体停下来问你？

## 2. 抖音：用一个问题说明边界

**素材**：竖屏版与竖屏封面；检查右侧互动按钮和底部简介是否遮挡字幕。

**标题**：AI 编程为什么总要你说继续？

**描述**：

任务没做完，AI 却先停了？AutoDrive 尝试给编程智能体加一道判断：该继续就继续，该停就停，需要选择或更多授权就交给人。不是“无限自动运行”。

基于 OpenCode 的研究原型，完整对比与消融尚未完成。视频为机制示意动画＋合成配音，不是跑分结果或已发表论文。

代码：https://github.com/eust-w/opencode/tree/auto-drive-engine

研究预览：https://github.com/eust-w/opencode/releases/tag/autodrive-research-preview-2026-10-25

**话题候选**：#AI编程 #智能体 #开源项目 #AutoDrive

**封面短句**：任务没完 / 为什么停了？

## 3. 微信视频号：强调可控与研究进度

**素材**：竖屏版。封面和视频文字检查小屏可读性，不在封面堆叠链接。

**描述**：

智能体的“自动继续”，应该有边界。

这段短片介绍 AutoDrive：一个基于 OpenCode 的续推控制研究原型。它在回合结束时区分继续、停止与暂缓，把需要补充信息、主观选择或更多授权的情况交还给用户。续推决定先记录，再进入持久队列，并设置次数上限。

目前公开的是代码、评测工具与论文草稿；完整对比和消融实验尚未完成。我们想验证的是：怎样减少重复输入“继续”，又保留人的控制权，而不是先给出效果承诺。

代码分支：https://github.com/eust-w/opencode/tree/auto-drive-engine

研究预览：https://github.com/eust-w/opencode/releases/tag/autodrive-research-preview-2026-10-25

说明：本视频为机制示意动画，使用合成中文配音；不代表已完成正式评测或已发表论文。

**话题候选**：#人工智能 #软件工程 #开源 #智能体

## 4. 小红书：面向学习者的三点笔记

**素材**：竖屏版与竖屏封面。

**标题**：给AI编程加一个“继续键”？

**正文**：

写长任务时，烦人的可能不是 AI 不会写，而是它做着做着就问：“还要继续吗？”

AutoDrive 探索的不是一味点继续，而是三个边界：

① CONTINUE：下一步明确、仍在授权范围内，继续。

② STOP：任务完成，或不再需要继续，停止。

③ DEFER：缺信息、要做选择、需要更多权限，交还给人。

工程上，决定先记入会话，再把续推输入加入持久队列；每条自动续推链都有次数上限。它是 OpenCode 上的研究原型，不是全自动成功保证。

代码和论文草稿已公开，但完整对比与消融还没完成。视频没有“提升百分之多少”的承诺，也不把测试通过当成科研结论。

代码：https://github.com/eust-w/opencode/tree/auto-drive-engine

研究预览：https://github.com/eust-w/opencode/releases/tag/autodrive-research-preview-2026-10-25

内容说明：机制示意动画＋合成配音，非真实任务录像，非已发表论文成果。

**话题候选**：#AI编程 #开源项目 #智能体 #程序员学习 #软件工程

**封面短句**：继续 / 停止 / 交给人

## 5. YouTube：可检索的中文技术介绍

**素材**：横屏版，单独上传中文字幕 SRT；是否另发竖屏 Shorts 需避免无意重复发布，本次默认只发布一个横屏版本。

**标题**：AutoDrive：AI 编程何时继续、何时停止？| Turn-Boundary Control

**描述**：

为什么编程智能体任务还没做完，就停下来问你“要继续吗”？本片用约 90 秒介绍 AutoDrive：基于 OpenCode 的回合边界续推控制研究原型。

CONTINUE / STOP / DEFER 分别表示继续、停止和交还用户。我们展示三态决策、先记录后入队、用户引导在安全边界接入，以及有限自动续推的设计。

项目分支 / Source branch:
https://github.com/eust-w/opencode/tree/auto-drive-engine

研究预览、论文草稿 / Research preview and manuscript drafts:
https://github.com/eust-w/opencode/releases/tag/autodrive-research-preview-2026-10-25

研究状态：正式对比与消融结果尚未完成。现有实现、测试和草稿不证明性能提升、人工节省、运行时零风险或期刊/arXiv 发表。研究预览仍有未解决的依赖告警。

内容说明：合成中文旁白、中文展示字幕、机制示意动画；不是实时运行演示，没有模仿特定真人声音。

English note: AutoDrive is a research prototype for turn-boundary continuation control in coding agents. This video is a mechanism illustration with synthetic Mandarin narration, not a benchmark demonstration. Formal comparative and ablation results are incomplete; the manuscript is a draft, not a published paper.

**标签候选**：AutoDrive, OpenCode, coding agents, agent control, AI编程, 智能体, open source

**描述末尾话题**：#AutoDrive #CodingAgents #OpenSource

不添加未经时间轴核对的章节时间戳。上传时根据当前 YouTube Studio 的 AI 使用披露问题如实选择；简介声明不能代替平台要求的原生标签。

## 6. X：紧凑的问题与公开代码入口

**素材**：横屏版；账号上传权限和文件大小先验收，不假定账号有订阅权限。

**单条正文**：

AI 编程总要你说“继续”？
AutoDrive：继续 / 停止 / 交还用户。OpenCode 续推控制研究原型；有界续推、持久队列。
机制动画＋合成配音；实验未完成，不是性能结论。
代码 https://github.com/eust-w/opencode/tree/auto-drive-engine
研究预览 https://github.com/eust-w/opencode/releases/tag/autodrive-research-preview-2026-10-25
#OpenSource

无独立标题字段。正文按当前编辑器的加权计数验收，不能用普通字符串长度断言必定不超限；如账号 UI 报超长，优先删末尾话题及“研究预览”标签，保留事实边界和两个链接。

## 发布者使用说明

- 六个平台均使用最终已验收视频，不上传渲染中间文件、原始日志、实验凭据或私人账号截图。
- 如平台提供“AI生成/合成”“创作声明”等原生选项，按实际素材如实申报；保留画面和简介中的“合成配音 / 机制示意 / 研究预览”。
- 不把标题的疑问句改成“再也不用说继续”“完全无人值守”“已证明更强”等未经验证的结论。
- 不勾选真人出镜、实际录屏、实验结果展示或已发表成果等不符合本片的分类。原创图形与合成旁白的授权凭据必须保留。
- 发布后记录实际账号、视频 ID、提交时间、审核状态和可访问 URL。看到上传成功或审核中，不等于公开可见。

事实审查见 [claims-map.md](claims-map.md)，平台规则和操作门槛见 [publishing-checklist.md](publishing-checklist.md)。
