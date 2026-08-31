---
version: 1
slug: "pages-map-map-wxml"
primary_target: "pages/map/map.wxml"
related_targets: []
---

# Surface brief · pages/map/map（水杯定位）

## Scope & mode
- 整页重设计（2026-08-29，surface roll 6d186189 assigned index 6「量杯刻度板」，code-led）：地图即页面——全幅地图为舞台，界面收缩为顶部浮胶囊 + 底部液态刻度板；Operate 模式（找杯任务）。手机唯一形态。
- 入口：首页「定位」快捷项与「我的」页 goMap，navigateTo 非 tab 页；navigationStyle custom。

## Audience / job / action
- 杯主找水杯：打开即见杯在哪；未连接→去连接；已连接→知道谁在定位（GPS/手机）、数据多新、附近地标；一键回到水杯位置。

## Proof / content
- 定位来源三级：BLE GPS 通知（5s 轮询）> 手机定位（wx.getLocation，需已连蓝牙）> 云端 gpsLatest（15s 节流，读 cup_gps 单点，无轨迹历史——界面不得承诺轨迹）。
- 状态语言：徽章 在线(绿)/定位中(琥珀脉冲)/离线(灰)；摘要行 summaryStatusText；新鲜度 = 3 分钟窗口的 teal 水位条 + 「x分钟前更新」（来源时间戳 cupFixAt：云用上报 ts，GPS/手机用本机时钟）。
- 地图覆盖：cup.png（108px teal 圆标，程序化生成，脚本 .impeccable/build/gen-map-assets.mjs）+ 同心涟漪 circles（32m/85m）+ POI 小圆点 poi.png 与常显 callout（mapProxy reverseGeocoder，取 3 个）。
- 交互：设备切换 picker（无设备 toast）、GPS/手机分段（未连蓝牙显示「未连蓝牙 · 仅GPS」）、回水中 includePoints padding [150,60,400,60]、地图旋转 >0.5° 出现指北复位钮（rotate 属性绑定回正）。

## Chosen direction & memorable moment
- 量杯刻度板：底部 dock 像量杯内壁——发丝刻度水位条映射数据新鲜度；涟漪（地图 circles + 空态脉冲环）是「正在寻找/就在这里」的水语言；未连接空态给行动出口（去连接水杯）。
- 顶部仅两枚浮胶囊 + 条件性指北钮；旧版 124rpx 大罗盘、地图内状态芯片、设备 picker 全部移入底部板。

## Constraints
- 调色继承晨光浅水：#F7F9FA/#CEECF5 系 + teal #0F8EA8，墨青 #102A43；廉价红线四条生效（不堆砌动画、不滥用发光、不空、无广告腔）。
- 去AI感修订（2026-08-29 用户反馈「AI感太重」后执行，judge 复检 pass）：全部装饰性渐变移除（主按钮/水位条纯色 teal、dock 平涂 #FBFDFE）；浮层只留发丝描边不投影；dock 顶边 = 2rpx teal 发丝水线（呼应启动页「一线水光」，是本页签名细节）；主按钮圆角 16rpx、去字距把戏；分段控件选中态用描边不用阴影。
- 反AI打磨第二遍（2026-08-29，ui-ux-pro-max skill pass）：两级圆角体系确立——地图浮控件保持圆形（地图App平台惯例），刻度板内一律 16rpx 仪器面板圆角，杜绝全员胶囊；状态徽章降为裸「点+字」读数（去 chip 盒子），语义色去 Tailwind 默认值（#22c55e/#f59e0b → #1f9e6b/#d99a3d 同族调和，文字色 ok-ink #0e7a5f / warn-ink #8a6420 保证 4.5:1）；字重分层 700/500/400 替代满屏 800；地标从淡色小盒改为发丝线分隔行；量杯水位条补真实量程标注（3分钟前↔刚刚，对应 FRESH_WINDOW_MS）+ 12.5% 发丝小刻度（repeating-linear-gradient）+ 液面高光端线；板头展示真实数据「尾号 xxxxxx」（trackedDeviceMeta 原本已算好但未展示）；触控目标全部 ≥84rpx（backBtn/northBtn/titlePill/devicePill 84rpx、seg 84rpx 总高、primaryBtn 88rpx）；间距对齐 8rpx 节奏。上轮决定（主按钮无字距、分段选中态描边）保持不回退。
- 页面 height:100vh overflow hidden，map 绝对定位全幅——旧版小屏溢出问题（mapHeightPx 夹逼）随布局移除而消失。
- prefers-reduced-motion 全套降级；dockIn 入场 + gaugeFill width 过渡为仅有的两处动效；图标全部 CSS 绘制（项目惯例，无图标库）。
- 标记资产为程序化 PNG（provenance：gen-map-assets.mjs）；cup.png 由旧橙色版重绘为品牌 teal。

## Unresolved decisions
- DESIGN.md 仍未立系统；地图页的「量杯刻度板 + 涟漪状态」若被其他页复用，再以 /impeccable document 记录。
- gpsReport 云函数目录为空（设备上报端代码不在仓库）；若后端补轨迹历史接口，polylines 数据通道已保留。
