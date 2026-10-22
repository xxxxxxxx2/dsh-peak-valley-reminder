window.__ModuleLoader__.load({
	id: "dsh-peak-valley-reminder",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		//#region lib/client/runtime.js

		/**
		 * 取宿主 React。客户端包经 client-modules 注入 factory-require，React 属于
		 * 平台 seed 模块；取样失败时回落到 shell 暴露的 globalThis.React，
		 * 两者都没有就静默不渲染（绝不因为一个提示挂件炸掉整个标题栏）。
		 */
		function getReact() {
			if (typeof require === "function") {
				try {
					const react = require("react");
					if (react !== null && typeof react === "object" && typeof react.createElement === "function") return react;
				} catch (error) { /* 平台未把 react 作为 seed 时继续回落 */ }
			}
			const global = globalThis !== null && typeof globalThis === "object" ? globalThis.React : void 0;
			return global !== null && typeof global === "object" && typeof global.createElement === "function" ? global : null;
		}

		/** 只挂一次样式表，并打上本插件的 data 标记，卸载时由模块系统回收。 */
		const STYLE_ID = "dsh-peak-valley-reminder/PeakValleyReminder.module.css";
		const CSS = [
			".pvr-chip{display:inline-flex;align-items:center;gap:5px;min-height:28px;box-sizing:border-box;padding:3px 7px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary,#8a8a8a);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;font-variant-numeric:tabular-nums;cursor:pointer;-webkit-app-region:no-drag;transition:background-color .12s ease,color .12s ease}",
			".pvr-chip:hover,.pvr-chip:focus-visible,.pvr-chip[data-open=true]{background:var(--dsw-alias-fill-l1,rgba(255,255,255,.06));color:var(--dsw-alias-label-secondary,#b4b4b4);outline:none}",
			".pvr-dot{flex:none;width:7px;height:7px;border-radius:50%;background:#2fbf71;box-shadow:0 0 0 3px rgba(47,191,113,.16)}",
			".pvr-chip[data-phase=peak] .pvr-dot{background:#e8a33d;box-shadow:0 0 0 3px rgba(232,163,61,.16)}",
			".pvr-phase{font-weight:500}",
			".pvr-chip[data-phase=idle] .pvr-phase{color:#2fbf71}",
			".pvr-chip[data-phase=peak] .pvr-phase{color:#e8a33d}",
			".pvr-sep{opacity:.4}",
			".pvr-count{color:var(--dsw-alias-label-tertiary,#8a8a8a)}",
			".pvr-pop{position:fixed;z-index:200;box-sizing:border-box;width:336px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));border-radius:var(--dsw-radius-md,10px);background:var(--dsw-specific-menu,#1f1f22);box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.45));color:var(--dsw-alias-label-primary,#eee);font-size:12px;line-height:18px;-webkit-app-region:no-drag}",
			".pvr-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px}",
			".pvr-title{font-size:13px;font-weight:600;line-height:20px}",
			".pvr-clock{flex:none;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-variant-numeric:tabular-nums}",
			".pvr-row{display:flex;align-items:baseline;gap:8px;padding:5px 7px;border-radius:var(--dsw-radius-sm,6px);color:var(--dsw-alias-label-secondary,#b4b4b4)}",
			".pvr-row[data-active=true]{background:var(--dsw-alias-fill-l1,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,#eee)}",
			".pvr-rowName{flex:none;font-weight:500}",
			".pvr-row[data-phase=peak] .pvr-rowName{color:#e8a33d}",
			".pvr-row[data-phase=idle] .pvr-rowName{color:#2fbf71}",
			".pvr-rowDetail{flex:1 1 auto;min-width:0;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-variant-numeric:tabular-nums}",
			".pvr-foot{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));color:var(--dsw-alias-label-secondary,#b4b4b4);font-variant-numeric:tabular-nums}",
			".pvr-note{margin-top:6px;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:11px;line-height:16px}"
		].join("");
		function ensureStyle() {
			if (typeof document === "undefined" || document.head === null) return;
			const selector = "style[data-plugin-css=" + JSON.stringify(STYLE_ID) + "]";
			if (document.querySelector(selector) !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-peak-valley-reminder";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/client/schedule.js

		/**
		 * 时段规则（全部按北京时间 UTC+8，UTC+8 无夏令时，可用固定偏移换算）：
		 *
		 * - 高峰时段：周一至周五 09:00–12:00、14:00–18:00，且当天不是中国法定节假日；
		 * - 空闲时段：其余所有时间——包括周末、法定节假日全天、以及工作日的午休与夜间。
		 *
		 * 周末调休上班日（例如 2026-02-14 周六、2026-10-10 周六）按“周末全天空闲”处理，
		 * 与规则里的“包括周末”一致。
		 */
		const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
		const DAY_MS = 24 * 60 * 60 * 1000;
		/** 高峰窗口，单位：当日秒数。 */
		const PEAK_WINDOWS_SEC = [
			[9 * 3600, 12 * 3600],
			[14 * 3600, 18 * 3600]
		];
		/**
		 * 中国法定节假日（含调休放假的周末，按日期区间书写）。
		 * 来源：国务院办公厅《关于 2026 年部分节假日安排的通知》（国办发明电〔2025〕7 号）。
		 * 新一年度通知发布后，在这里补一组区间即可。
		 */
		const HOLIDAY_RANGES = [
			["2026-01-01", "2026-01-03"],
			["2026-02-15", "2026-02-23"],
			["2026-04-04", "2026-04-06"],
			["2026-05-01", "2026-05-05"],
			["2026-06-19", "2026-06-21"],
			["2026-09-25", "2026-09-27"],
			["2026-10-01", "2026-10-07"]
		];
		/** 两位补零。 */
		function pad2(value) {
			return value < 10 ? "0" + String(value) : String(value);
		}
		/** `YYYY-MM-DD` → UTC 零点时间戳（只用于日期算术）。 */
		function parseYmd(text) {
			const [year, month, day] = text.split("-").map(Number);
			return Date.UTC(year, month - 1, day);
		}
		/** 日期区间 → 日期集合。 */
		function buildHolidays(ranges) {
			const dates = /* @__PURE__ */ new Set();
			for (const [from, to] of ranges) {
				const end = parseYmd(to);
				for (let cursor = parseYmd(from); cursor <= end; cursor += DAY_MS) {
					const day = new Date(cursor);
					dates.add(day.getUTCFullYear() + "-" + pad2(day.getUTCMonth() + 1) + "-" + pad2(day.getUTCDate()));
				}
			}
			return dates;
		}
		const HOLIDAYS = buildHolidays(HOLIDAY_RANGES);
		/** 已收录放假安排的年份；不在其中的年份只能按“周一至周五”退化判断。 */
		const HOLIDAY_YEARS = new Set(Array.from(HOLIDAYS, (date) => date.slice(0, 4)));
		/** 北京时间下的年月日、星期与当日秒数。 */
		function beijingParts(nowMs) {
			const clock = new Date(nowMs + BEIJING_OFFSET_MS);
			return {
				year: clock.getUTCFullYear(),
				month: clock.getUTCMonth() + 1,
				day: clock.getUTCDate(),
				dow: clock.getUTCDay(),
				secondOfDay: clock.getUTCHours() * 3600 + clock.getUTCMinutes() * 60 + clock.getUTCSeconds() + clock.getUTCMilliseconds() / 1000
			};
		}
		/** 北京时间当日零点的时间戳。 */
		function beijingDayStart(nowMs, parts) {
			return Math.round(nowMs - parts.secondOfDay * 1000);
		}
		/** 北京时间某日的 `YYYY-MM-DD`。 */
		function beijingYmd(parts) {
			return parts.year + "-" + pad2(parts.month) + "-" + pad2(parts.day);
		}
		/**
		 * 该日的高峰窗口；周末与法定节假日返回 null（全天空闲）。
		 * @param dayStartMs - 北京时间当日零点。
		 */
		function peakWindowsOf(dayStartMs) {
			const noon = beijingParts(dayStartMs + 12 * 3600 * 1000);
			if (noon.dow === 0 || noon.dow === 6) return null;
			if (HOLIDAYS.has(beijingYmd(noon))) return null;
			return PEAK_WINDOWS_SEC;
		}
		/**
		 * 求当前时段与下一次切换。
		 * @param nowMs - 时间戳。
		 * @returns 高峰标记、距下一次切换的毫秒数、切换后是否高峰、切换时刻、数据覆盖情况。
		 */
		function stateAt(nowMs) {
			const parts = beijingParts(nowMs);
			const dayStart = beijingDayStart(nowMs, parts);
			const todayWindows = peakWindowsOf(dayStart);
			const peak = todayWindows !== null && todayWindows.some(([from, to]) => parts.secondOfDay >= from && parts.secondOfDay < to);
			let next;
			for (let offset = 0; offset <= 14 && next === void 0; offset++) {
				const start = dayStart + offset * DAY_MS;
				const windows = offset === 0 ? todayWindows : peakWindowsOf(start);
				if (windows === null) continue;
				for (const [from, to] of windows) {
					if (start + from * 1000 > nowMs) {
						next = { at: start + from * 1000, peak: true };
						break;
					}
					if (start + to * 1000 > nowMs) {
						next = { at: start + to * 1000, peak: false };
						break;
					}
				}
			}
			// 两周内没有高峰窗口只可能是数据异常，退化成一个稳定值，避免 UI 抖动
			if (next === void 0) next = { at: nowMs + 60 * 60 * 1000, peak: !peak };
			return {
				peak,
				nextPeak: next.peak,
				remainingMs: Math.max(0, next.at - nowMs),
				switchAtMs: next.at,
				covered: HOLIDAY_YEARS.has(String(parts.year)),
				year: parts.year
			};
		}
		/** 标题栏用的紧凑倒计时：超过一天用「N天H时」，否则 h:mm:ss / mm:ss。 */
		function compactCountdown(ms, lang) {
			const total = Math.max(0, Math.floor(ms / 1000));
			const days = Math.floor(total / 86400);
			const hours = Math.floor(total % 86400 / 3600);
			const minutes = Math.floor(total % 3600 / 60);
			const seconds = total % 60;
			if (days > 0) return lang === "zh" ? days + "天" + hours + "时" : days + "d " + hours + "h";
			if (hours > 0) return hours + ":" + pad2(minutes) + ":" + pad2(seconds);
			return pad2(minutes) + ":" + pad2(seconds);
		}
		/** 详情浮层用的口语化倒计时。 */
		function spokenCountdown(ms, lang) {
			const total = Math.max(0, Math.floor(ms / 1000));
			const days = Math.floor(total / 86400);
			const hours = Math.floor(total % 86400 / 3600);
			const minutes = Math.floor(total % 3600 / 60);
			const seconds = total % 60;
			if (lang === "zh") {
				if (days > 0) return days + " 天 " + hours + " 小时";
				if (hours > 0) return hours + " 小时 " + minutes + " 分";
				if (minutes > 0) return minutes + " 分 " + seconds + " 秒";
				return seconds + " 秒";
			}
			if (days > 0) return days + "d " + hours + "h";
			if (hours > 0) return hours + "h " + minutes + "m";
			if (minutes > 0) return minutes + "m " + seconds + "s";
			return seconds + "s";
		}
		/** 北京时间 HH:mm[:ss]。 */
		function beijingClock(nowMs, withSeconds) {
			const clock = new Date(nowMs + BEIJING_OFFSET_MS);
			const hhmm = pad2(clock.getUTCHours()) + ":" + pad2(clock.getUTCMinutes());
			return withSeconds ? hhmm + ":" + pad2(clock.getUTCSeconds()) : hhmm;
		}
		const WEEKDAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
		const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		/**
		 * 切换时刻的说法：今天 / 明天 / 后天 / 周X + HH:mm。
		 * @param switchAtMs - 切换时刻。
		 * @param nowMs - 当前时刻。
		 * @param lang - 语言。
		 */
		function switchCaption(switchAtMs, nowMs, text, lang) {
			const nowParts = beijingParts(nowMs);
			const target = beijingParts(switchAtMs);
			const dayDiff = Math.round((beijingDayStart(switchAtMs, target) - beijingDayStart(nowMs, nowParts)) / DAY_MS);
			let dayLabel;
			if (dayDiff === 0) dayLabel = text.today;
			else if (dayDiff === 1) dayLabel = text.tomorrow;
			else if (dayDiff === 2) dayLabel = text.dayAfter;
			else dayLabel = (lang === "zh" ? WEEKDAYS_ZH : WEEKDAYS_EN)[target.dow];
			return dayLabel + " " + beijingClock(switchAtMs, false);
		}
		/** 语言判定：跟随 DSH 界面语言，默认中文。 */
		function detectLang() {
			const candidates = [];
			try {
				candidates.push(document.documentElement.lang);
			} catch (error) { /* 非浏览器环境 */ }
			try {
				candidates.push(navigator.language);
			} catch (error) { /* 非浏览器环境 */ }
			for (const candidate of candidates) if (typeof candidate === "string" && candidate.toLowerCase().startsWith("zh")) return "zh";
			return candidates.some((candidate) => typeof candidate === "string" && candidate.length > 0) ? "en" : "zh";
		}
		//#endregion
		//#region lib/client/copy.js

		const TEXT = {
			zh: {
				label: "峰谷",
				title: "峰谷",
				peakName: "高峰",
				idleName: "空闲",
				chipPeak: "峰",
				chipIdle: "谷",
				rowPeak: "高峰时段",
				rowIdle: "空闲时段",
				detailPeak: "周一至周五 09:00–12:00、14:00–18:00",
				detailIdle: "其余时段 · 周末 · 法定节假日",
				remain: "还剩",
				toPeak: "距高峰",
				toIdle: "距空闲",
				footPeak: "距空闲还有",
				footIdle: "距高峰还有",
				today: "今天",
				tomorrow: "明天",
				dayAfter: "后天",
				hintClick: "点击查看详情",
				bj: "北京时间",
				note: "北京时间 UTC+8 · 法定节假日按国务院办公厅 2026 年安排计算",
				noteGap: "该年度放假安排未收录，暂按周一至周五判断"
			},
			en: {
				label: "Peaks",
				title: "Peaks",
				peakName: "Peak",
				idleName: "Idle",
				chipPeak: "Peak",
				chipIdle: "Idle",
				rowPeak: "Peak hours",
				rowIdle: "Idle hours",
				detailPeak: "Mon–Fri 09:00–12:00, 14:00–18:00",
				detailIdle: "All other times · weekends · public holidays",
				remain: "left",
				toPeak: "peak in",
				toIdle: "idle in",
				footPeak: "Idle starts in",
				footIdle: "Peak starts in",
				today: "Today",
				tomorrow: "Tomorrow",
				dayAfter: "In 2 days",
				hintClick: "Click for details",
				bj: "UTC+8",
				note: "Beijing time (UTC+8) · public holidays per the 2026 State Council schedule",
				noteGap: "No holiday calendar for this year yet; weekdays are treated as working days"
			}
		};
		//#endregion
		//#region lib/client/PeakValleyReminder.js

		/** 标题栏「模式」标签之后的峰谷时段挂件。 */
		function PeakValleyReminder() {
			const react = getReact();
			if (react === null) return null;
			const lang = detectLang();
			const text = TEXT[lang];
			const [now, setNow] = react.useState(() => Date.now());
			const [open, setOpen] = react.useState(false);
			const [anchor, setAnchor] = react.useState(null);
			const close = () => {
				setOpen(false);
				setAnchor(null);
			};
			const buttonRef = react.useRef(null);
			const panelRef = react.useRef(null);
			react.useEffect(() => {
				const timer = setInterval(() => setNow(Date.now()), 1000);
				return () => clearInterval(timer);
			}, []);
			react.useEffect(() => {
				if (!open) return void 0;
				const place = () => {
					const element = buttonRef.current;
					if (element === null) return;
					const rect = element.getBoundingClientRect();
					const width = 336;
					const viewportWidth = window.innerWidth;
					const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
					const top = Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 230));
					setAnchor({ top, left });
				};
				place();
				const onPointerDown = (event) => {
					const target = event.target;
					if (buttonRef.current !== null && buttonRef.current.contains(target)) return;
					if (panelRef.current !== null && panelRef.current.contains(target)) return;
					close();
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") close();
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown);
				window.addEventListener("resize", place);
				window.addEventListener("scroll", place, true);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("resize", place);
					window.removeEventListener("scroll", place, true);
				};
			}, [open]);
			const state = stateAt(now);
			const phaseChip = state.peak ? text.chipPeak : text.chipIdle;
			const phaseName = state.peak ? text.peakName : text.idleName;
			const nextLabel = state.nextPeak ? text.toPeak : text.toIdle;
			const countText = lang === "zh" ? text.remain + " " + compactCountdown(state.remainingMs, lang) : compactCountdown(state.remainingMs, lang) + " " + text.remain;
			const spoken = spokenCountdown(state.remainingMs, lang);
			const caption = switchCaption(state.switchAtMs, now, text, lang);
			const openParen = lang === "zh" ? "（" : " (";
			const closeParen = lang === "zh" ? "）" : ")";
			const tooltip = [
				text.label + " · " + phaseName,
				nextLabel + " " + spoken + openParen + caption + closeParen,
				text.hintClick
			].join("\n");
			const h = react.createElement;
			const chip = h("button", {
				ref: buttonRef,
				type: "button",
				className: "pvr-chip",
				"data-phase": state.peak ? "peak" : "idle",
				"data-open": open ? "true" : "false",
				"aria-label": text.label + ": " + phaseName + ", " + nextLabel + " " + spoken,
				"aria-expanded": open,
				title: tooltip,
				onClick: () => {
					if (open) close();
					else setOpen(true);
				}
			}, h("span", { className: "pvr-dot" }), h("span", { className: "pvr-phase" }, phaseChip), h("span", { className: "pvr-sep" }, "·"), h("span", { className: "pvr-count" }, countText));
			if (!open) return h(react.Fragment, null, chip);
			const rows = [
				{
					key: "peak",
					name: text.rowPeak,
					detail: text.detailPeak,
					active: state.peak
				},
				{
					key: "idle",
					name: text.rowIdle,
					detail: text.detailIdle,
					active: !state.peak
				}
			];
			if (anchor === null) return h(react.Fragment, null, chip);
			const panel = h("div", {
				ref: panelRef,
				className: "pvr-pop",
				role: "dialog",
				"aria-label": text.title,
				style: { top: String(anchor.top) + "px", left: String(anchor.left) + "px" }
			}, h("div", { className: "pvr-head" }, h("span", { className: "pvr-title" }, text.title), h("span", { className: "pvr-clock" }, text.bj + " " + beijingClock(now, true))), rows.map((row) => h("div", {
				key: row.key,
				className: "pvr-row",
				"data-phase": row.key,
				"data-active": row.active ? "true" : "false"
			}, h("span", { className: "pvr-rowName" }, row.name), h("span", { className: "pvr-rowDetail" }, row.detail))), h("div", { className: "pvr-foot" }, (state.peak ? text.footPeak : text.footIdle) + " " + spoken + openParen + caption + closeParen), h("div", { className: "pvr-note" }, state.covered ? text.note : text.noteGap));
			return h(react.Fragment, null, chip, panel);
		}
		//#endregion
		//#region lib/client/plugin.js

		const SLOT = "conversation.session.header.actions";
		const inject = ["slots"];
		/**
		 * 挂到会话标题栏「模式」（agent 预设标签，order -10）之后、后台任务（order 20）之前：
		 * 取 0 即紧挨模式选择右侧。
		 */
		function apply(ctx) {
			ensureStyle();
			ctx.effect(() => ctx.slots.inject(SLOT, () => ctx.slots.register({
				name: SLOT,
				id: "peak-valley-reminder",
				order: 0,
				label: () => TEXT[detectLang()].label
			}, PeakValleyReminder)), "peak-valley-reminder: header chip");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		/** 时段模型与格式化函数的只读出口，供离线自检使用（UI 不读它）。 */
		exports.__internals = {
			stateAt,
			peakWindowsOf,
			beijingClock,
			beijingParts,
			compactCountdown,
			spokenCountdown,
			switchCaption,
			HOLIDAYS,
			HOLIDAY_YEARS,
			PEAK_WINDOWS_SEC,
			BEIJING_OFFSET_MS
		};
		return module.exports;
	}
});
