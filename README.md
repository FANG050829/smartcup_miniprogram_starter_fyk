<div align="center">

<img src="images/weixin_cup/pet-hero.svg" width="200" alt="SmartCup 表情宠物球"/>

# SmartCup 智能水杯小程序

围绕「喝水」这一件事，提供饮水记录与提醒、饮水计划、水温 / 水量 / TDS 水质展示、心情宠物、AI 聊天助手、地图定位与家人关爱等功能。

[![platform](https://img.shields.io/badge/platform-WeChat%20Mini%20Program-07C160?logo=wechat&logoColor=white)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![cloud](https://img.shields.io/badge/cloud-WeChat%20CloudBase-1AAD19)](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
[![canvas](https://img.shields.io/badge/render-Canvas%202D-2563EB)]()

</div>

<p align="center"><img src="images/weixin_cup/wave-divider.svg" width="560" alt=""/></p>

## 功能一览

### TabBar 导航（4 入口）

| Tab | 页面 | 核心功能 |
| --- | --- | --- |
| 首页 | `pages/index/` | 今日饮水量、目标完成度、水温 / 水量 / TDS 水质卡片、中央表情宠物球、四宫格快捷入口 |
| 计划 | `pages/plan/` | 饮水计划制定、喝水提醒管理（订阅消息 / 前台提醒） |
| 心情 | `pages/mood/` | 三形态虚拟宠物（球球 / 云宝 / 亮亮）、Canvas 表情引擎 |
| 我的 | `pages/profile/` | 个人中心、数据概览、功能入口集合 |

### 全模块索引

| 模块 | 页面 | 说明 |
| --- | --- | --- |
| 启动 | `pages/launch/` | 加载动画 → 自动跳转首页 |
| 数据统计 | `pages/data/` | 饮水历史图表、趋势统计 |
| 设备连接 | `pages/device/` | BLE 扫描 / 连接水杯，读取水量 / 水温 / TDS |
| 聊天助手 | `pages/chat/` | AI 喝水助手，云函数代理调用 LLM |
| 地图定位 | `pages/map/` | GPS 轨迹上报与查询、位置展示 |
| 家人关爱 | `pages/family-care/` | 远程关注长辈 / 孩子饮水情况 |
| 硬件体检 | `pages/diagnostic/` | 六项硬件逐项检测 + 总体诊断 |
| 提醒管理 | `pages/water-reminder/` | 喝水提醒增删改查 + 订阅消息对接 |
| 饮水打卡 | `pages/checkin/` | 单次饮水打卡 |
| 每日打卡 | `pages/daily-checkin/` | 每日习惯打卡 |
| 水质百科 | `pages/water-quality-standards/` | TDS / pH / 硬度等水质标准解读 |
| 权限管理 | `pages/permission/` | 蓝牙 / 定位 / 通知权限统一管理 |
| 设置 | `pages/settings/` | 全局设置与诊断入口 |

### 模块说明

- **首页**：水质检测与温度卡片实时展示 TDS 与水温；设备 / 定位 / 智聊 / 加热四宫格快捷入口环绕中央表情宠物球；下方「自动饮水记录」卡片汇总今日饮水量、当前杯中水量、目标完成度、剩余量、连续达标天数与今日打卡次数，核心数据一屏尽览。
- **计划**：顶部概览今日饮水量与目标（2000 ml）完成进度；「提醒」列表支持新建、编辑、删除喝水提醒（如 10:00 / 14:00 / 18:00 每天提醒），已执行的提醒自动打上「已完成」标签，配合订阅消息准时催你喝水。
- **心情**：基于 Canvas 表情引擎的三形态虚拟宠物（球球 / 云宝 / 亮亮）自由切换；大画布实时演绎「开心」「困倦」「惊讶」等情绪反应动画，下方可按生命周期 / 情绪 / 状态筛选全部表情并随时回放。
- **聊天**：AI 喝水助手，内置饮水分析、提醒计划、改善习惯、水质解读等快捷提问入口，回复附带健康提示（仅供参考，严重不适请就医）；底层通过 `llmProxy` 云函数代理调用 LLM（默认 DeepSeek）。
- **设备连接**：通过蓝牙（BLE）扫描连接智能水杯，连接成功后即可在首页同步水量 / 水温 / TDS 实时数据。
- **硬件体检**：设备硬件体检室，支持逐项检测定位、温度、水质、水位、实时通讯、加热六大模块，汇总总体结果并给出异常提示，方便快速排查水杯连接问题。
- **家人关爱**：通过 `familyCare` 云函数跨账号共享饮水数据，远程关注家人饮水情况，异常时及时提醒。

## 界面预览

> 需要特别说明的是，当前所展示的界面仅为系统中的部分代表性界面示例，并非系统包含的全部界面内容。

<div align="center">

<table>
    <tr>
        <th>首页 · 数据总览</th>
        <th>计划 · 提醒管理</th>
        <th>心情 · 表情引擎</th>
    </tr>
    <tr>
        <td><a href="images/weixin_cup/home_page_image.png"><img src="images/weixin_cup/home_page_image.png" width="252" alt="首页"/></a></td>
        <td><a href="images/weixin_cup/paln_image.png"><img src="images/weixin_cup/paln_image.png" width="252" alt="计划"/></a></td>
        <td><a href="images/weixin_cup/expression_image.png"><img src="images/weixin_cup/expression_image.png" width="252" alt="心情"/></a></td>
    </tr>
    <tr>
        <td><strong>聊天 · AI 助手</strong></td>
        <td><strong>设备 · 蓝牙连接</strong></td>
        <td><strong>诊断 · 硬件检测</strong></td>
    </tr>
    <tr>
        <td><a href="images/weixin_cup/chat_image.png"><img src="images/weixin_cup/chat_image.png" width="252" alt="聊天"/></a></td>
        <td><a href="images/weixin_cup/connect_image.png"><img src="images/weixin_cup/connect_image.png" width="252" alt="设备连接"/></a></td>
        <td><a href="images/weixin_cup/test_image.png"><img src="images/weixin_cup/test_image.png" width="252" alt="硬件测试"/></a></td>
    </tr>
</table>

<sub>点击任意截图可在新页面查看原图</sub>

</div>

## 技术栈

- 微信小程序原生开发（WXML / WXSS / JS，webview 渲染，自定义 tabBar）
- 微信云开发：云函数 + 云数据库
- 云函数：`wx-server-sdk`、`node-fetch`
- Canvas 2D：心情宠物表情引擎（`utils/emotion` 球球 / `utils/mates` 云宝·亮亮）

## 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                         微信小程序客户端                          │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │
│  │  pages/  │  │components│  │custom-tab │  │    utils/      │ │
│  │  17 页面 │  │pet-ball  │  │  -bar     │  │ emotion·mates  │ │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  │ ble·llm·remind │ │
│        │              │              │       │ drinkData·log  │ │
│        └──────────┬──┴──────────────┘       └──────┬─────────┘ │
│                   │                                 │           │
│  ┌────────────────┴─────────────────────────────────┴────────┐ │
│  │                    app.js / app.json                        │ │
│  │           云环境初始化 · 全局状态 · 提醒调度                │ │
│  └────────────────────────────────────────────────────────────┘ │
│         │                      │                      │         │
│         ▼                      ▼                      ▼         │
│  ┌──────────┐          ┌──────────┐          ┌──────────┐       │
│  │ wx.ble   │          │ wx.cloud │          │ wx.llm    │       │
│  │ BLE 协议 │          │ 云开发   │          │ 不可直连 │       │
│  └────┬─────┘          └────┬─────┘          └────┬─────┘       │
└───────┼──────────────────────┼─────────────────────┼───────────┘
        │                      │                     │
        ▼                      ▼                     ▼
┌──────────────┐     ┌───────────────────┐    ┌──────────────┐
│ 智能水杯 BLE │     │   微信云开发      │    │ LLM API      │
│ FFF0/FFF1/   │     │ 7 个云函数        │    │ (DeepSeek)   │
│ FFF2/FFF3    │     │ CloudDB + Storage │    │              │
└──────────────┘     └───────────────────┘    └──────────────┘
```

### 表情引擎（`utils/emotion`）

球球表情引擎是一个基于 Canvas 2D 的实时动画引擎，核心职责：

- **驱动层**（`engine.js`）：rAF 状态机 + 弹簧插值，管理情绪配置注册中心、眼环池轮换、眨眼关键帧、自动巡演调度。自带 NaN 防线——真机 `performance.now` 可能返回非有限数值，引擎统一回退 `Date.now()` 防止渲染循环崩溃。
- **渲染层**（`ball-canvas.js`）：径向渐变球体 + 斜环彩带。彩带使用 12 层嵌套虚线沿闭合椭圆轨道滑行（虚线周期 = 轨道周长，接缝无缝），按 z 轴正负拆前后两层裁剪模拟 3D 旋转；5-stop 色相漂移（默认 9s 周期）、3.4s 自转周期。
- **数据层**（`rings.js` / `emotions.js`）：约 30 种表情配置，每种含球体色、眼睛形态（椭圆 / 线性插值 / 泪滴）、彩带色相锚点、过渡时长。

### BLE 连接栈（`utils/ble.js`）

智能水杯使用标准 BLE 协议栈：

| UUID | 用途 |
| --- | --- |
| `0000FFF0-...` | Service |
| `0000FFF1-...` | Notify —— 水杯上报水量 / 水温 / TDS |
| `0000FFF2-...` | Write —— 写入指令（唤醒、清零等） |
| `0000FFF3-...` | Info —— 设备信息读取 |

连接流程：`openAdapter → startDiscovery → connect → discoverServices → enableNotify → stabilize(600ms)`，共 12 次服务发现重试 + 4 次 Notify 绑定重试 + 18s 连接超时，全部串行化防止真机并发崩溃。

### 云函数清单

| 云函数 | 职责 |
| --- | --- |
| `bindCup` | 用户 ↔ 水杯绑定关系 |
| `drinkRecord` | 饮水记录 CRUD + 聚合 |
| `familyCare` | 跨账号饮水数据共享（家人关爱） |
| `gpsLatest` | 最新位置查询 |
| `hydrationAdvice` | 饮水建议生成 |
| `llmProxy` | LLM 代理（OpenAI 兼容接口，默认 DeepSeek） |
| `mapProxy` | 地图服务代理 |

## 目录结构

```
├── app.js                  # 应用入口：云环境初始化、提醒服务、全局错误上报
├── app.json                # 页面注册（17 页）、自定义 tabBar、权限声明
├── pages/
│   ├── launch/             # 启动加载页
│   ├── index/              # 首页 · 数据总览 + 宠物球
│   ├── plan/               # 饮水计划与提醒
│   ├── mood/               # 心情 · 表情宠物
│   ├── data/               # 饮水历史与统计图表
│   ├── profile/            # 个人中心（tabBar 「我的」）
│   ├── device/             # 蓝牙连接与设备管理
│   ├── chat/               # AI 喝水助手
│   ├── map/                # 定位 / GPS 轨迹
│   ├── family-care/        # 家人关爱
│   ├── diagnostic/         # 硬件体检
│   ├── water-reminder/     # 提醒管理
│   ├── checkin/            # 饮水打卡
│   ├── daily-checkin/      # 每日打卡
│   ├── water-quality-standards/  # 水质标准百科
│   ├── permission/         # 权限管理
│   └── settings/           # 设置
├── components/
│   └── pet-ball/           # 首页宠物水球（复用 emotion/ 引擎）
├── custom-tab-bar/         # 自定义底部导航（胶囊造型）
├── cloudfunctions/
│   ├── bindCup/            # 用户-水杯绑定
│   ├── drinkRecord/        # 饮水记录读写
│   ├── familyCare/         # 家人关爱（跨账号数据共享）
│   ├── gpsLatest/          # 最新位置查询
│   ├── hydrationAdvice/    # 饮水建议
│   ├── llmProxy/           # LLM 聊天代理（默认 DeepSeek）
│   └── mapProxy/           # 地图服务代理
├── utils/
│   ├── ble.js              # BLE 蓝牙协议栈
│   ├── bootLog.js          # 启动日志 + 异常上报
│   ├── checkinCore.js / checkinOps.js  # 打卡逻辑
│   ├── drinkData.js        # 饮水数据存取
│   ├── waterReminderCore.js / planReminderCore.js  # 提醒核心
│   ├── waterLevel.js       # 杯内水位换算
│   ├── deviceRegistry.js   # 设备注册表
│   ├── locationSettings.js # 定位权限兜底
│   ├── llm.js / llmConfig.js   # LLM 客户端封装
│   ├── wxCompat.js         # 多端兼容层（手机 / 桌面端）
│   ├── emotion/            # 球球表情引擎（球头 + 彩带 + 几何 + 渲染）
│   ├── mates/              # 云宝 / 亮亮角色引擎
│   └── pet/                # 宠物 store + glance 情绪
└── project.config.json
```

## 快速开始

### 1. 环境准备

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（稳定版）
- 已开通[微信云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)的小程序 AppID
- Node.js（云函数本地调试需要）

### 2. 配置项目

1. 将本项目导入微信开发者工具。
2. 在 `project.config.json` 中把 `appid` 替换为你自己的小程序 AppID。
3. 在 `app.js` 中配置云开发环境 ID：

   ```js
   globalData: {
     envId: "cloud1-xxxxx"  // 留空则使用开发者工具当前选择的云环境
   }
   ```

4. 如需使用 npm 依赖，在项目根目录执行：

   ```bash
   npm install
   ```

   然后在微信开发者工具中执行「工具 → 构建 npm」。

### 3. 部署云函数

在微信开发者工具中，右键 `cloudfunctions/` 下的每个云函数，选择「上传并部署：云端安装依赖」。

### 4. 配置 LLM 聊天（可选）

`llmProxy` 云函数默认调用 DeepSeek API，需在其云端环境变量中配置：

| 环境变量 | 说明 | 默认值 |
| --- | --- | --- |
| `LLM_API_KEY`（或 `DEEPSEEK_API_KEY`） | LLM API Key，**必填** | 无 |
| `LLM_BASE_URL` | OpenAI 兼容接口地址 | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 模型名 | `deepseek-chat` |
| `LLM_MAX_TOKENS` | 单次回复 token 上限 | `300` |
| `LLM_MAX_HISTORY_MESSAGES` | 携带的历史消息条数 | `6` |
| `LLM_HTTP_TIMEOUT_MS` | 上游请求超时（ms） | `55000` |

### 5. 运行

在微信开发者工具中编译运行即可，入口页为 `pages/launch/launch`（模拟加载后自动进入首页）。

## 多端兼容

- 兼容手机端与桌面端（PC / Mac 微信），桌面端自动进入兼容模式（关闭常亮、提醒等服务）。
- 适配安全区（`env(safe-area-inset-bottom)`）。
- 尊重系统「减少动态效果」（prefers-reduced-motion）设置。

---

## 许可与使用限制

**本项目仅供个人学习、研究与交流使用，严禁用于任何商业用途。**

未经作者书面许可，任何人不得将本项目的全部或部分代码、资源用于商业产品、商业服务、SaaS、客户交付或其他营利性场景。如需商业使用，请先与作者联系获取授权。

### 校园学习场景使用说明

- 欢迎在**注明出处**（附本仓库链接）的前提下，将本项目用于课程设计、毕业设计、校园竞赛等非商业学习场景。
- 参赛或提交作业时，请如实说明哪些部分基于本项目二次开发，不得将其作为完全原创作品提交。
- 涉及商业化运营或营利性比赛的，超出上述授权范围，请先联系作者获得授权。

### 第三方内容声明

- `utils/emotion/`（球球表情引擎）与 `utils/mates/`（云宝 / 亮亮角色）移植并修改自开源项目 [aora-bot](https://github.com/sam70361/aora-bot)（© sam70361），遵循原项目许可条款：**仅供个人学习研究，禁止商业用途**，其角色视觉形象不提供任何商业授权。上述目录内容的版权归原项目作者所有，本声明不对其重新授权。

## 免责声明

本项目为智能水杯的配套软件，硬件部分不在本仓库范围内。本项目按「现状」提供，仅供学习交流使用，作者不对因使用本项目而产生的任何直接或间接损失承担责任。
