# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- （推断）杯主本人：拥有智能水杯的日常饮水者，全天多次打开小程序查看饮水量、目标完成度与提醒。
- （推断）家人：通过「家人关爱」功能远程关注长辈/孩子的饮水情况。

## Product Purpose

智能水杯（SmartCup）的配套微信小程序：记录并督促每日饮水，展示水温/水量/TDS 水质，提供饮水计划、打卡、心情记录、数据图表、设备连接（蓝牙）、水质标准、家人关爱等能力。（依据：pages/ 目录与 tabBar 配置）

## Positioning

（推断）真实硬件 + 云数据的饮水健康管理：不是纯记录工具，而是「杯子自己会说话」——水质、水温、水量由设备实时上报。

## Operating Context

- 微信小程序（WXML/WXSS，webview 渲染，rpx 单位），云开发环境 cloud1-d6grh9jgl3278f657。
- 入口页为 pages/launch/launch（约 2s 模拟加载后 switchTab 到首页），无真实网络等待依赖。
- App 视觉世界（代码既有事实）：浅色水世界——首页底色 #CEECF5、液态卡片与气泡元素、全局底 #F7F9FA、主色 teal #0f8ea8、强调蓝 #8fbfff/#5a90eb。
- 硬件部分（水杯本体）不在本仓库范围。

## Capabilities and Constraints

- tabBar 自定义（custom-tab-bar），四 tab：首页/计划/心情/我的。
- 启动页为模拟进度（约 1.9s easeOutCubic），非真实加载等待；需保留「必进首页」的兜底逻辑。
- 需兼容 prefers-reduced-motion 与安全区（env(safe-area-inset-bottom)）。

## Brand Commitments

- 品牌名：智能水杯 / SMART CUP（App 名 SmartCup）。此为事实文案，未经确认不替换。
- （2026-08-29 用户确认，针对启动加载页）最终基调为「晨光浅水」：**主题白 #F7F9FA + 浅蓝 #CEECF5 系 + teal #0F8EA8 点缀**（用户明确指令「尽量用主题的白色和浅蓝色」，覆盖其早前选过的「深夜静水」深色方向——不得据过时记录回退深色）。
- 启动页构图「一线水光」：中央最亮、两端消隐的 teal 发丝水线 + 线心水珠，连续渐变水场，背景仅极缓柔光漂移。
- 廉价红线（用户确认，四条全部生效）：动画不堆砌不花哨；不滥用发光/塑料渐变；画面不能空得像没做完；文案不用广告腔。

## Evidence on Hand

- 代码即证据：pages/、app.wxss、custom-tab-bar/。无独立品牌资产文件（logo 图、字体文件均未见）。
- 无真实用户数据/证言/截图，不得虚构。

## Product Principles

- （推断）安静可靠：健康数据产品，先可信再有趣。
- （推断）水是主角：视觉语言围绕「水」的物理事实（液面、涟漪、气泡、透光），不做无关装饰。
- （推断）动效为状态服务：每个动效对应真实状态变化（进入/加载/完成）。
