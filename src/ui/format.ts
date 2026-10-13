// Number and text formatting shared by the HUD, the Codex and debug views.

/** Fixed decimals: fmt(2.345, 1) → "2.3". */
export const fmt = (n: number, d = 0) => n.toFixed(d);
/** Rounded with thousands separators: "1,350". */
export const n0 = (n: number) => Math.round(n).toLocaleString();
/** Rounded, trailing zeros dropped: f1(2.50) → "2.5", f1(2.0) → "2". */
export const f1 = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString();
/** Resources are shown whole: amounts you hold round down, amounts you need round up. */
export const have = (n: number) => Math.floor(n + 1e-6).toLocaleString();
export const need = (n: number) => Math.ceil(n - 1e-6).toLocaleString();
export const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / b) * 100)).toFixed(1)}%`;
/** Escape text for innerHTML. */
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
