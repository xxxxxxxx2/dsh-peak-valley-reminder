/**
 * 离线自检：用桩 window.__ModuleLoader__ 加载 lib/client.js，
 * 校验高峰/空闲判定、下一次切换、节假日与格式化输出。
 *
 * 规则：北京时间周一至周五 09:00–12:00、14:00–18:00 为高峰，
 * 其余时间（含周末与中国法定节假日全天）为空闲。
 */
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8');

let registration;
globalThis.window = { __ModuleLoader__: { load(reg) { registration = reg; } } };

/* eslint-disable-next-line no-eval */
eval(source);

if (!registration || registration.id !== 'dsh-peak-valley-reminder') {
	throw new Error('bundle did not register under the expected module id');
}

const api = registration.factory(() => {
	throw new Error('no externals expected at module scope');
}).__internals;

/** 北京时间 → 时间戳。 */
const bj = (iso) => Date.parse(iso + '+08:00');

const HOUR = 3600;
const DAY = 86400;

const cases = [
	// 普通工作日（2026-10-22 周四）
	{ at: '2026-10-22T08:59:59', peak: false, nextPeak: true, remainSec: 1 },
	{ at: '2026-10-22T09:00:00', peak: true, nextPeak: false, remainSec: 3 * HOUR },
	{ at: '2026-10-22T11:59:59', peak: true, nextPeak: false, remainSec: 1 },
	{ at: '2026-10-22T12:00:00', peak: false, nextPeak: true, remainSec: 2 * HOUR },
	{ at: '2026-10-22T13:59:59', peak: false, nextPeak: true, remainSec: 1 },
	{ at: '2026-10-22T14:00:00', peak: true, nextPeak: false, remainSec: 4 * HOUR },
	{ at: '2026-10-22T17:59:59', peak: true, nextPeak: false, remainSec: 1 },
	{ at: '2026-10-22T18:00:00', peak: false, nextPeak: true, remainSec: 15 * HOUR },
	// 周五傍晚 → 下周一早上（62.5 小时）
	{ at: '2026-10-23T18:30:00', peak: false, nextPeak: true, remainSec: 62.5 * HOUR },
	// 周末
	{ at: '2026-10-24T10:00:00', peak: false, nextPeak: true, remainSec: 47 * HOUR },
	{ at: '2026-10-25T10:00:00', peak: false, nextPeak: true, remainSec: 23 * HOUR },
	{ at: '2026-10-26T09:00:01', peak: true, nextPeak: false, remainSec: 3 * HOUR - 1 },
	// 国庆假期（周四，工作日但放假）→ 收假后 10-08 周四 09:00，6 天 23 小时
	{ at: '2026-10-01T10:00:00', peak: false, nextPeak: true, remainSec: 6 * DAY + 23 * HOUR },
	// 劳动节里的周一 → 05-06 周三 09:00
	{ at: '2026-05-04T10:00:00', peak: false, nextPeak: true, remainSec: DAY + 23 * HOUR },
	// 春节假期里的周一 → 02-24 周二 09:00
	{ at: '2026-02-16T10:00:00', peak: false, nextPeak: true, remainSec: 7 * DAY + 23 * HOUR },
	// 假期后第一个工作日
	{ at: '2026-02-24T10:00:00', peak: true, nextPeak: false, remainSec: 2 * HOUR },
	// 调休上班的周六（2026-02-14）：规则里“周末全天空闲”，下一次高峰是 02-24 周二
	{ at: '2026-02-14T10:00:00', peak: false, nextPeak: true, remainSec: 9 * DAY + 23 * HOUR }
];

let failures = 0;
const fail = (message) => {
	failures += 1;
	console.log('FAIL ' + message);
};

for (const testCase of cases) {
	const now = bj(testCase.at);
	const state = api.stateAt(now);
	if (state.peak !== testCase.peak) fail(`${testCase.at} peak: got ${state.peak}, want ${testCase.peak}`);
	if (state.nextPeak !== testCase.nextPeak) fail(`${testCase.at} nextPeak: got ${state.nextPeak}, want ${testCase.nextPeak}`);
	const remainSec = Math.round(state.remainingMs / 1000);
	if (Math.abs(remainSec - testCase.remainSec) > 1) fail(`${testCase.at} remaining: got ${remainSec}s, want ${testCase.remainSec}s`);
	// 切换时刻必须落在整分钟上（09:00 / 12:00 / 14:00 / 18:00）
	if (state.switchAtMs % 60000 !== 0) fail(`${testCase.at} switch is not minute-aligned: ${new Date(state.switchAtMs).toISOString()}`);
	// 跨过切换点后状态必须翻转
	const after = api.stateAt(state.switchAtMs + 1000);
	if (after.peak === state.peak) fail(`${testCase.at} phase does not flip after switch point`);
	if (after.remainingMs <= 0) fail(`${testCase.at} next window collapsed`);
}

// 节假日表本身
for (const date of ['2026-01-01', '2026-02-17', '2026-04-06', '2026-05-05', '2026-06-19', '2026-09-25', '2026-10-07']) {
	if (!api.HOLIDAYS.has(date)) fail(`holiday missing: ${date}`);
}
for (const date of ['2026-01-04', '2026-02-24', '2026-10-08', '2026-12-31']) {
	if (api.HOLIDAYS.has(date)) fail(`not a holiday: ${date}`);
}
if (api.HOLIDAYS.has('2026-02-14') || api.HOLIDAYS.has('2026-02-24')) fail('Spring Festival range is off by one day');

// 格式化
const formats = [
	[0, 'zh', '00:00'],
	[1500, 'zh', '00:01'],
	[3599999, 'zh', '59:59'],
	[3600000, 'zh', '1:00:00'],
	[42308000, 'zh', '11:45:08'],
	[62.5 * HOUR * 1000, 'zh', '2天14时'],
	[62.5 * HOUR * 1000, 'en', '2d 14h']
];
for (const [ms, lang, expected] of formats) {
	const actual = api.compactCountdown(ms, lang);
	if (actual !== expected) fail(`compactCountdown(${ms}, ${lang}): got ${actual}, want ${expected}`);
}
const spoken = [
	[42308000, 'zh', '11 小时 45 分'],
	[90000, 'zh', '1 分 30 秒'],
	[42308000, 'en', '11h 45m'],
	[62.5 * HOUR * 1000, 'zh', '2 天 14 小时']
];
for (const [ms, lang, expected] of spoken) {
	const actual = api.spokenCountdown(ms, lang);
	if (actual !== expected) fail(`spokenCountdown(${ms}, ${lang}): got ${actual}, want ${expected}`);
}
if (api.beijingClock(bj('2026-10-22T12:44:52'), true) !== '12:44:52') fail('beijingClock seconds');
if (api.beijingClock(bj('2026-10-01T09:05:00'), false) !== '09:05') fail('beijingClock minutes');

// 切换时刻的口语化描述
const zhText = { today: '今天', tomorrow: '明天', dayAfter: '后天' };
if (api.switchCaption(bj('2026-10-22T18:00:00'), bj('2026-10-22T12:10:00'), zhText, 'zh') !== '今天 18:00') fail('switchCaption today');
if (api.switchCaption(bj('2026-10-23T09:00:00'), bj('2026-10-22T18:30:00'), zhText, 'zh') !== '明天 09:00') fail('switchCaption tomorrow');
if (api.switchCaption(bj('2026-10-26T09:00:00'), bj('2026-10-23T18:30:00'), zhText, 'zh') !== '周一 09:00') fail('switchCaption weekday');

console.log(failures === 0 ? `all checks passed (${cases.length} windows)` : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
