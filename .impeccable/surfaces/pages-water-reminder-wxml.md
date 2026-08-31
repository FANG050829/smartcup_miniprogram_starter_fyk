---
version: 1
slug: "pages-water-reminder-wxml"
primary_target: "pages/water-reminder/water-reminder.wxml"
related_targets: ["pages/water-reminder/water-reminder.js", "utils/waterReminderCore.js", "pages/profile/profile.wxml"]
---

# Surface brief · pages/water-reminder（久未喝水提醒）

## Scope & mode
- 整页重做（2026-08-29，第二轮；第一轮为卡片段落式设置页）：核心目标有二——(1) 与「喝水提醒」概念划清界限（用户明确反馈易混淆），(2) 反 AI 视觉。手机唯一形态，原生导航栏（json title=久未喝水提醒）。

## 防混淆决策（本页第一设计约束）
- 命名三处统一为「久未喝水提醒」：页面 json navigationBarTitleText、profile 入口 list-row（原为「喝水提醒」，是混淆根源）、waterReminderCore 提醒弹窗 title。
- 页面身份 = 「喝水间隔水钟」：hero 卡「距上次喝水 + 流逝读数 + 流向 N 小时提醒线的水位条」，表达 watchdog（盯间隔）而非闹钟（按点响）。
- 文案如实：开关关闭时 stateWord=未启用、note=提醒未开启，当前仅记录饮水间隔（原版关闭后仍显示「距下次提醒约…」，属虚假承诺，已修）。
- 弹窗 content 去「哦！」广告腔。

## 状态语言
- statusTone: empty(未开始/灰) / ok(监测中/teal水位) / alert(已超时/#c14f43 水位+暖卡底)；stateTone 独立于 statusTone——未启用一律灰点，防止绿色误读为监测中。
- elapsedPercent = 已流逝/interval（封顶100），JS 计算后入 data；三处重复的时长格式化合并为 sinceLastWaterText + timerStatus（原 _calculateTimeSinceLastWater 为死代码，已删）。

## 反AI约束（生效中）
- 无渐变/无光斑/无发光/无字距把戏；页面平涂继承全局 #F7F9FA；卡片平涂白 + 发丝描边 20rpx 圆角，内控件 12rpx，主按钮 16rpx。
- 字重 700/500/400，数字 tabular-nums；说明区为发丝线脚注（不做琥珀盒子）。
- 动效仅两处：水位条 width 600ms 过渡、超时状态点脉冲；prefers-reduced-motion 全降级。
- 返回交给原生导航；radio 用 label 包裹整行可点；picker 包裹整行（触控 ≥84rpx）。

## 事实备注
- SUBSCRIBE_TMPL_IDS 为空：后台订阅消息未接，提醒实际以小程序内 showModal 触发（通知选项 desc 已改为「小程序内弹出提醒窗口」，原「系统通知栏消息提醒」与实现不符）。
- sound 方式实现为 toast、无真实提示音（waterReminderCore.js），UI 文案「播放提示音」超前于实现——后续若修 core，此 desc 无需动。
- 预览镜像 .impeccable/preview/water-reminder.html（×0.52，含原生导航替身）；四状态截图 .impeccable/review/wr2-state-*.png。
