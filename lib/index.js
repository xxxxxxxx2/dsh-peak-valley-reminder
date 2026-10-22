/**
 * dsh-peak-valley-reminder — host 半边。
 *
 * 这是一个纯客户端 UI 插件：提醒内容（北京时间、时段、倒计时）全部在浏览器里
 * 计算，host 侧不注册任何服务、路由或工具，因此这里只有一个空 apply。
 * 保留 host 半边是因为 loader 按“包”挂载条目，同一份 package.json 的
 * `dsh.client` 才会被 client-modules 扫描并下发到浏览器。
 */

/** Loader 条目名（与 cordis.patch.yml / package.json 中的 id 保持一致）。 */
export const name = 'peak-valley-reminder';

/** 不依赖任何 host 服务。 */
export const inject = [];

/** 纯 UI 插件：host 侧无事可做。 */
export function apply() {}
