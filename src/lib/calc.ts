/**
 * Calculation engine (PLANNING.md §4). Pure functions shared by client (live preview)
 * and server (authoritative). No JavaScript floats: everything goes through decimal.js.
 */
import Decimal from "decimal.js";

/** 1 Maan = 40 KG. Fixed system constant, not user editable. */
export const KG_PER_MAAN = 40;

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;
export type NumLike = Decimal.Value | { toString(): string } | null | undefined;

/** Convert anything numeric (string, number, Prisma.Decimal, decimal.js) into a Decimal. */
export function dec(v: NumLike): Decimal {
  if (v === null || v === undefined || v === "") return new D(0);
  if (v instanceof Decimal) return new D(v);
  if (typeof v === "number" || typeof v === "string") return new D(v);
  return new D(v.toString());
}

/** Round to 2 dp HALF_UP (the stored precision for all amounts). */
export function money(v: NumLike): Decimal {
  return dec(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export interface SessionInput {
  maan: NumLike;
  kg: NumLike;
  ratePerMaan: NumLike;
  ratePerKg: NumLike;
}

/** SessionAmount = (Maan × RatePerMaan) + (KG × RatePerKG), stored rounded to 2 dp HALF_UP. */
export function sessionAmount(s: SessionInput): Decimal {
  return money(dec(s.maan).mul(dec(s.ratePerMaan)).plus(dec(s.kg).mul(dec(s.ratePerKg))));
}

/** DailyAmount = MorningAmount + EveningAmount (each already rounded to 2 dp). */
export function dailyAmount(morning?: SessionInput | null, evening?: SessionInput | null): Decimal {
  const m = morning ? sessionAmount(morning) : new D(0);
  const e = evening ? sessionAmount(evening) : new D(0);
  return m.plus(e);
}

/** TotalKG (informational) = Maan × 40 + KG */
export function toKg(maan: NumLike, kg: NumLike): Decimal {
  return dec(maan).mul(KG_PER_MAAN).plus(dec(kg));
}

/** Normalise a KG total back into Maan + KG (e.g. 99 KG → 2 Maan 19 KG). */
export function splitKg(totalKg: NumLike): { maan: Decimal; kg: Decimal } {
  const t = dec(totalKg);
  const maan = t.div(KG_PER_MAAN).floor();
  return { maan, kg: t.minus(maan.mul(KG_PER_MAAN)) };
}

export function ratePerKgFromMaan(ratePerMaan: NumLike): Decimal {
  return dec(ratePerMaan).div(KG_PER_MAAN).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function ratePerMaanFromKg(ratePerKg: NumLike): Decimal {
  return dec(ratePerKg).mul(KG_PER_MAAN).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/** True when the two rates are not linked by ÷40 (shown as a warning, not an error — D2). */
export function ratesMismatch(ratePerMaan: NumLike, ratePerKg: NumLike): boolean {
  return !ratePerKgFromMaan(ratePerMaan).eq(dec(ratePerKg).toDecimalPlaces(4, Decimal.ROUND_HALF_UP));
}

export type RoundingMode = "RUPEE" | "PAISA";

/**
 * Display rounding. HALF_UP only — banker's rounding would show 110,042.50 as 110,042.
 * Always round the exact total; never sum rounded values.
 */
export function roundDisplay(v: NumLike, mode: RoundingMode = "RUPEE"): Decimal {
  return dec(v).toDecimalPlaces(mode === "RUPEE" ? 0 : 2, Decimal.ROUND_HALF_UP);
}

export function sum(values: NumLike[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new D(0));
}

// ---------------------------------------------------------------------------
// Statement maths (§4.1, §5.3). Works on ledger lines so it is reusable by the
// service layer and directly unit-testable with the reference sheet figures.
// ---------------------------------------------------------------------------

export type LedgerCategory =
  | "OPENING"
  | "BANDHI"
  | "MANDI"
  | "CHARGES"
  | "PAYMENTS"
  | "CREDITS";

const CATEGORY_BY_TYPE: Record<string, LedgerCategory> = {
  OPENING: "OPENING",
  BANDHI_CHARGE: "BANDHI",
  MANDI_CHARGE: "MANDI",
  ADDITIONAL_CHARGE: "CHARGES",
  DEBIT_ADJ: "CHARGES",
  REFUND: "CHARGES",
  PAYMENT: "PAYMENTS",
  DISCOUNT: "CREDITS",
  CREDIT_ADJ: "CREDITS",
  CASH_ADJ: "CREDITS",
};

export interface StatementLine {
  txnType: string;
  /** For REVERSAL lines: the txnType of the line being reversed. */
  reversedType?: string | null;
  debit: NumLike;
  credit: NumLike;
}

export interface StatementTotals {
  openingBalance: Decimal;
  totalBandhi: Decimal;
  totalMandi: Decimal;
  totalMilk: Decimal;
  additionalCharges: Decimal;
  payments: Decimal;
  credits: Decimal;
  closingBalance: Decimal;
}

export function categoryOf(line: StatementLine): LedgerCategory {
  const t = line.txnType === "REVERSAL" ? line.reversedType ?? "DEBIT_ADJ" : line.txnType;
  return CATEGORY_BY_TYPE[t] ?? "CHARGES";
}

/**
 * ClosingBalance = Opening + TotalMilk + AdditionalCharges − Payments − Credits.
 * `priorBalance` is the ledger balance before the period; OPENING lines dated inside
 * the period are folded into the opening balance. Reversals net against their category.
 */
export function computeStatementTotals(priorBalance: NumLike, lines: StatementLine[]): StatementTotals {
  const buckets: Record<LedgerCategory, Decimal> = {
    OPENING: new D(0),
    BANDHI: new D(0),
    MANDI: new D(0),
    CHARGES: new D(0),
    PAYMENTS: new D(0),
    CREDITS: new D(0),
  };
  for (const l of lines) {
    const net = dec(l.debit).minus(dec(l.credit));
    const c = categoryOf(l);
    buckets[c] = buckets[c].plus(net);
  }
  const openingBalance = dec(priorBalance).plus(buckets.OPENING);
  const totalBandhi = buckets.BANDHI;
  const totalMandi = buckets.MANDI;
  const totalMilk = totalBandhi.plus(totalMandi);
  const additionalCharges = buckets.CHARGES;
  const payments = buckets.PAYMENTS.neg();
  const credits = buckets.CREDITS.neg();
  const closingBalance = openingBalance.plus(totalMilk).plus(additionalCharges).minus(payments).minus(credits);
  return { openingBalance, totalBandhi, totalMandi, totalMilk, additionalCharges, payments, credits, closingBalance };
}

/** Balance = Σ Debit − Σ Credit */
export function balanceOf(lines: { debit: NumLike; credit: NumLike }[]): Decimal {
  return lines.reduce<Decimal>((acc, l) => acc.plus(dec(l.debit)).minus(dec(l.credit)), new D(0));
}

export interface AllocationBucket {
  id: string | null;
  due: NumLike;
}

/** FIFO allocation of payments to buckets (oldest first). Returns allocations and remaining advance. */
export function allocateFifo(
  payments: { id: string; amount: NumLike }[],
  buckets: AllocationBucket[],
): { allocations: { paymentId: string; bucketId: string | null; amount: Decimal }[]; advance: Decimal } {
  const remainingDue = buckets.map((b) => ({ id: b.id, left: Decimal.max(dec(b.due), 0) }));
  const allocations: { paymentId: string; bucketId: string | null; amount: Decimal }[] = [];
  let advance = new D(0);
  for (const p of payments) {
    let left = dec(p.amount);
    for (const b of remainingDue) {
      if (left.lte(0)) break;
      if (b.left.lte(0)) continue;
      const take = Decimal.min(left, b.left);
      allocations.push({ paymentId: p.id, bucketId: b.id, amount: new D(take) });
      b.left = b.left.minus(take);
      left = left.minus(take);
    }
    advance = advance.plus(left);
  }
  return { allocations, advance };
}
