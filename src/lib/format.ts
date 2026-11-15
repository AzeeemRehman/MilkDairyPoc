import { dec, roundDisplay, type NumLike, type RoundingMode } from "./calc";

export type Grouping = "INTL" | "LAKH";

export interface DisplaySettings {
  rounding: RoundingMode;
  grouping: Grouping;
}

export const DEFAULT_DISPLAY: DisplaySettings = { rounding: "RUPEE", grouping: "INTL" };

function groupDigits(intPart: string, grouping: Grouping): string {
  if (grouping === "INTL" || intPart.length <= 3) return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // South Asian: last 3 digits, then groups of 2  (9,43,577)
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** Format a number with the display grouping; `dp` fixed decimals. */
export function formatNumber(v: NumLike, dp = 0, grouping: Grouping = "INTL"): string {
  const d = dec(v);
  const neg = d.isNegative() && !d.isZero();
  const fixed = d.abs().toFixed(dp);
  const [i, f] = fixed.split(".");
  return `${neg ? "-" : ""}${groupDigits(i, grouping)}${f ? "." + f : ""}`;
}

/** Display an amount: HALF_UP rounding to whole rupees (or paisa) + grouping. */
export function formatMoney(v: NumLike, s: DisplaySettings = DEFAULT_DISPLAY, withPrefix = false): string {
  const dp = s.rounding === "RUPEE" ? 0 : 2;
  const out = formatNumber(roundDisplay(v, s.rounding), dp, s.grouping);
  return withPrefix ? `Rs. ${out}` : out;
}

/** Exact 2-dp amount (used in line items and exports). */
export function formatExact(v: NumLike, grouping: Grouping = "INTL"): string {
  return formatNumber(v, 2, grouping);
}

/** Quantities: drop trailing zeros (9.000 → 9, 12.500 → 12.5). */
export function formatQty(v: NumLike): string {
  const d = dec(v);
  return d.toDecimalPlaces(3).toString();
}

/** Maan-KG notation used on the paper sheet, e.g. "23-0". */
export function maanKg(maan: NumLike, kg: NumLike): string {
  return `${formatQty(maan)}-${formatQty(kg)}`;
}

export function balanceClass(v: NumLike): string {
  const d = dec(v);
  if (d.gt(0)) return "text-red-700";
  if (d.lt(0)) return "text-green-700";
  return "text-slate-700";
}
