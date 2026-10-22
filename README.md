# dsh-peak-valley-reminder

[![dsh](https://img.shields.io/badge/dsh-plugin-0.2.1--rc.2-4f6bed)](https://www.npmjs.com/package/@deepseek-ai/dsh)
[![license](https://img.shields.io/badge/license-MIT-2fbf71)](LICENSE)

DeepSeek Harness（DSH）插件：在会话标题栏**「模式」标签之后**常驻一枚「**峰谷**」提醒，
告诉你现在处在**高峰时段**还是**空闲时段**，并倒计时下一次切换。

![峰谷提醒](docs/screenshot.png)

「峰谷」是这个 UI 的名称：挂件上用 **峰 / 谷** 两个单字表示当前状态（峰=高峰，谷=空闲），
悬停与详情面板里用完整说法「高峰时段 / 空闲时段」。

## 时段规则（北京时间 UTC+8）

| 时段 | 窗口 |
| --- | --- |
| **高峰时段** | 周一至周五 **09:00–12:00**、**14:00–18:00**，且当天不是中国法定节假日 |
| **空闲时段** | 其余所有时间：周末、法定节假日全天、工作日的午休与夜间 |

判定细节：

- 全部按北京时间（UTC+8，无夏令时）用固定偏移换算，不受本机时区影响；
- 周末调休上班日（如 2026-02-14 周六、2026-10-10 周六）按“周末全天空闲”处理，
  与“其余时段，包括周末”一致；
- 法定节假日按国务院办公厅通知的**放假日历**判定（含调休放假的周末），
  已内置 2026 年安排（国办发明电〔2025〕7 号）：
  元旦 01-01～01-03、春节 02-15～02-23、清明 04-04～04-06、劳动节 05-01～05-05、
  端午 06-19～06-21、中秋 09-25～09-27、国庆 10-01～10-07。
  未收录年份自动退化为“只按周一至周五判断”，详情浮层会给出提示。

## 界面

| 位置 | 内容 |
| --- | --- |
| 会话标题栏（「标准模式」之后） | 状态圆点 + **峰/谷** + 距下次切换的倒计时，每秒刷新 |
| 悬停 | 原生提示：峰谷 · 高峰/空闲、距下次切换多久（今天 18:00 / 明天 09:00 / 周一 09:00）、点击看详情 |
| 点击 | 详情浮层「峰谷」：北京时间、高峰与空闲两个时段的窗口、距切换倒计时与切换时刻、数据口径说明 |

高峰用琥珀色圆点，空闲用绿色圆点；倒计时超过一天时显示「N天H时」，否则 `h:mm:ss`。
文案跟随 DSH 中/英界面语言（`locale/`）。

## 安装

### 从 npm 安装（发布后）

```sh
dsh plugin --profile desktop add dsh-peak-valley-reminder
```

或在 DSH 的**插件市场 / 添加插件**向导里搜索 `dsh-peak-valley-reminder`，
搜索能力来自 `dsh-plugin` 关键词。

### 本地开发（改完刷新即生效）

在 profile 目录里链接源码目录：

```powershell
cd <profile>            # 例如 C:\Users\<you>\.dsh\profiles\desktop
pnpm add link:D:/Deepseek/worker/plugins/dsh-peak-valley-reminder
```

再把条目写进该 profile 的 `cordis.patch.yml`（DSH 会监听该文件并热加载）：

```yaml
- insert:
    - id: peak-valley-reminder
      name: dsh-peak-valley-reminder
      config: {}
```

> 用 `dsh plugin add` 安装时不需要手写这段：包的 `dsh.bundle.patch` 会自动带上它。

卸载：从 `cordis.patch.yml` 删掉这条 `insert`（或用 `dsh plugin remove`），再 `pnpm remove dsh-peak-valley-reminder`。

## 包结构

| 文件 | 作用 |
| --- | --- |
| `lib/index.js` | host 半边：空 `apply`，只为让 loader 以“包”为单位挂载并扫到 `dsh.client` |
| `lib/client.js` | 浏览器半边：`window.__ModuleLoader__` 工厂，注册挂件、自持样式与时段模型 |
| `cordis.patch.yml` | loader 条目（`insert`） |
| `locale/{zh,en}.json` | 插件清单里的标题与描述 |
| `icon.svg` | 插件图标 |
| `test/window-model.test.cjs` | 离线自检（时段模型 + 格式化） |

## 挂载点

注册在 `conversation.session.header.actions`，`order: 0`：agent 预设标签（「标准模式」）是
`order: -10`，后台任务入口是 `order: 20`，因此它正好落在两者之间、紧挨模式选择右侧。

想换位置只改 `lib/client.js` 里的 `SLOT` / `order`；想放进页面左上角的前导席位，
把 `SLOT` 换成 `conversation.header.leading` 并按 single 席位注册（`{ name: SLOT }`）即可。

## 换年 / 改规则

都在 `lib/client.js` 的 `schedule.js` 段：

- 新增年度放假安排：往 `HOLIDAY_RANGES` 补一组 `["YYYY-MM-DD", "YYYY-MM-DD"]` 区间；
- 改高峰窗口：改 `PEAK_WINDOWS_SEC`（当日秒数，例如 `[9 * 3600, 12 * 3600]`）；
- 周末与节假日的判定集中在 `peakWindowsOf()`。

## 自检

```sh
npm test
```

用桩 `window.__ModuleLoader__` 加载真实 bundle，覆盖 17 个时刻：四个切换边界（09:00 / 12:00 /
14:00 / 18:00 前后一秒）、周五傍晚到下周一、周末、国庆/劳动节/春节假期、调休上班的周六，
并校验切换点对齐、跨点翻转、节假日区间端点与倒计时格式化。`npm publish` 前会由
`prepublishOnly` 自动跑一遍。

## 发布

```sh
npm publish            # 或 pnpm publish
```

发布前建议补上 `repository` / `homepage` / `bugs` 字段，并把 README 顶部的徽章换成正式仓库地址。

## License

MIT
