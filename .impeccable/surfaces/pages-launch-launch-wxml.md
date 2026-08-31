---
version: 1
slug: "pages-launch-launch-wxml"
primary_target: "pages/launch/launch.wxml"
related_targets: []
---

# Surface brief · pages/launch/launch（启动加载页）

## Scope & mode
- 启动瞬态页：约 2.6s（1.9s 注满 + 涟漪 + 淡出），Experience 模式的品牌瞬间——等待本身被认真对待。
- 手机唯一形态（小程序），无桌面断点。

## Audience / job / action
- 杯主打开小程序的第一眼：确认「杯子正在醒来」，安静过渡到首页。
- 无交互；唯一动作是等待后自动 switchTab 首页。

## Proof / content
- 品牌锁排：智能水杯 / SMART CUP（事实文案，不换）。
- 状态文案两条，1500ms 单次切换：「正在唤醒水杯」→「连接云端饮水记录」。
- 模拟加载（非真实网络等待）；必进首页兜底（switchTab fail→reLaunch + 3.6s guard）。

## Chosen direction & memorable moment
- 一线水光 · 落水变奏（seed 4dff850d，surface-scope code-led，v4）：连续渐变水场（天白 #F7F9FA → 线处 #E4F0F6 → 深水 #BCDDEA，46% 线处无接缝）+ 中央最亮两端消隐的 teal 发丝水线（#0D8AA4）+ 水下倒影线 + 沿线巡行光斑 + 珠下轻摇倒影光柱 + 线心 teal 水珠（#0F8EA8）。
- 大胆层（v4，回应用户「太简陋，加精致感和大胆」）：① 落水叙事——1.24s 一滴水从 56rpx 大字标后方坠落，1.86s 击中线心（CSS 固定时序，z 序在文字下）；② 水面镜像字标——scaleY(-1)、En 行离水线最近、0.2/0.14 alpha、mask 随深度消隐，注满时 Cn/En 错相轻晃一次；③ 环境加厚——双暗涌（26s/34s 反向）+ 两片水光光斑（19s/23s）。
- 注满时刻：水珠摊开再收拢（scale 1.5×0.75 + 提亮）+ 三道羽化波前（radial-gradient 软环 0/200/420ms 错峰，8.5×5/6.5×4/4.5×3，峰值 0.6/0.45/0.32 递减）+ 倒影光柱亮一次；JS settled 类挂根节点统一触发。
- 构图：大字标居中于线上 96rpx；页脚安全区上方 64rpx 一行轮换文案（底部锚点，让倒影区干净）。
- 背景动效为用户三轮反馈明确要求（「背景加动效」→「多加动效」→「太简陋」），radial-halo 检测警告（浅色页误报）经 brief 覆盖记录在案。
- 签名意象 = 水线光剖面 + 水珠 + 羽化波前 + 镜像字标：后续不得加粗/加晕/加宽这条线，不得把波前改回描边环，不得让镜像变实。

## Constraints
- 廉价红线（用户确认，四条全部生效）：不堆砌动画；不滥用发光/渐变；不能空得像没做完；无广告腔。
- 调色（用户指定）：主题白 + 浅蓝（#F7F9FA / #CEECF5 系），teal #0F8EA8 点缀，文字墨青 #1C2B33 系。
- brandEn ≥20rpx（finish reviewer 修复项）；prefers-reduced-motion 全套降级；launch.json 背景色 #F7F9FA（app.json 全局 window 未动，避免其他页面底色漂移）。
- 无自定义字体资产（系统字 PingFang SC 系），brandCn 用字距+text-indent 光学补偿居中。

## Unresolved decisions
- DESIGN.md 未写（surface 范围、app 既有世界未变）；若后续其他页面采用「连续渐变水场 + 发丝水线」语言，再以 /impeccable document 立系统记录。
