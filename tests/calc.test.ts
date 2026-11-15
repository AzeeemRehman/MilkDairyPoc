import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  allocateFifo,
  computeStatementTotals,
  dailyAmount,
  dec,
  ratePerKgFromMaan,
  ratePerMaanFromKg,
  ratesMismatch,
  roundDisplay,
  sessionAmount,
  splitKg,
  sum,
  toKg,
} from "@/lib/calc";
import { formatMoney, formatNumber } from "@/lib/format";

const s = (maan: number | string, kg: number | string, rpm: number | string, rpk: number | string) => ({
  maan,
  kg,
  ratePerMaan: rpm,
  ratePerKg: rpk,
});

describe("§4.4 Bandhi reference", () => {
  it("9 Maan morning + 9 Maan evening @ 8,264 = 148,752 per day, 743,760 for 5 days", () => {
    const session = sessionAmount(s(9, 0, 8264, 206.6));
    expect(session.toFixed(2)).toBe("74376.00");
    const daily = dailyAmount(s(9, 0, 8264, 206.6), s(9, 0, 8264, 206.6));
    expect(daily.toFixed(2)).toBe("148752.00");
    expect(daily.mul(5).toFixed(2)).toBe("743760.00");
  });
});

describe("§4.4 Mandi reference", () => {
  const days = [
    { m: s(0, 33, 11300, 282.5), e: s(0, 35, 11300, 282.5), mAmt: "9322.50", eAmt: "9887.50", total: "19210.00" },
    { m: s(0, 15, 11300, 282.5), e: s(0, 24, 11000, 275), mAmt: "4237.50", eAmt: "6600.00", total: "10837.50" },
    { m: s(0, 5, 11800, 295), e: s(0, 21, 11800, 295), mAmt: "1475.00", eAmt: "6195.00", total: "7670.00" },
    { m: s(0, 23, 11300, 282.5), e: s(1, 19, 11800, 295), mAmt: "6497.50", eAmt: "17405.00", total: "23902.50" },
    { m: s(1, 23, 12800, 320), e: s(2, 5, 13300, 332.5), mAmt: "20160.00", eAmt: "28262.50", total: "48422.50" },
  ];

  it.each(days.map((d, i) => [i + 1, d] as const))("day %i matches the hand-checked figures", (_, d) => {
    expect(sessionAmount(d.m).toFixed(2)).toBe(d.mAmt);
    expect(sessionAmount(d.e).toFixed(2)).toBe(d.eAmt);
    expect(dailyAmount(d.m, d.e).toFixed(2)).toBe(d.total);
  });

  it("total 110,042.50 displays as 110,043 (HALF_UP, not banker's)", () => {
    const total = sum(days.map((d) => dailyAmount(d.m, d.e)));
    expect(total.toFixed(2)).toBe("110042.50");
    expect(roundDisplay(total).toString()).toBe("110043");
    expect(formatMoney(total)).toBe("110,043");
  });

  it("quantity totals: morning 1 Maan 99 KG, evening 3 Maan 104 KG", () => {
    expect(sum(days.map((d) => d.m.maan)).toString()).toBe("1");
    expect(sum(days.map((d) => d.m.kg)).toString()).toBe("99");
    expect(sum(days.map((d) => d.e.maan)).toString()).toBe("3");
    expect(sum(days.map((d) => d.e.kg)).toString()).toBe("104");
  });
});

describe("§4.4 Statement reference (S.S.N Dairy Farm 01–05/08/2026)", () => {
  it("743,760 + 110,042.50 + 89,774 = 943,576.50 → Rs. 943,577", () => {
    const t = computeStatementTotals(89774, [
      ...Array.from({ length: 5 }, () => ({ txnType: "BANDHI_CHARGE", debit: "148752.00", credit: 0 })),
      { txnType: "MANDI_CHARGE", debit: "19210.00", credit: 0 },
      { txnType: "MANDI_CHARGE", debit: "10837.50", credit: 0 },
      { txnType: "MANDI_CHARGE", debit: "7670.00", credit: 0 },
      { txnType: "MANDI_CHARGE", debit: "23902.50", credit: 0 },
      { txnType: "MANDI_CHARGE", debit: "48422.50", credit: 0 },
    ]);
    expect(t.totalBandhi.toFixed(2)).toBe("743760.00");
    expect(t.totalMandi.toFixed(2)).toBe("110042.50");
    expect(t.closingBalance.toFixed(2)).toBe("943576.50");
    expect(formatMoney(t.closingBalance, { rounding: "RUPEE", grouping: "INTL" }, true)).toBe("Rs. 943,577");
  });

  it("reversals net against the original category; payments and credits reduce the balance", () => {
    const t = computeStatementTotals(1000, [
      { txnType: "BANDHI_CHARGE", debit: 500, credit: 0 },
      { txnType: "REVERSAL", reversedType: "BANDHI_CHARGE", debit: 0, credit: 500 },
      { txnType: "BANDHI_CHARGE", debit: 450, credit: 0 },
      { txnType: "PAYMENT", debit: 0, credit: 300 },
      { txnType: "DISCOUNT", debit: 0, credit: 50 },
      { txnType: "ADDITIONAL_CHARGE", debit: 25, credit: 0 },
      { txnType: "OPENING", debit: 100, credit: 0 },
    ]);
    expect(t.openingBalance.toString()).toBe("1100");
    expect(t.totalBandhi.toString()).toBe("450");
    expect(t.payments.toString()).toBe("300");
    expect(t.credits.toString()).toBe("50");
    expect(t.additionalCharges.toString()).toBe("25");
    expect(t.closingBalance.toString()).toBe("1225");
  });
});

describe("rounding and units", () => {
  it("HALF_UP edge cases", () => {
    expect(roundDisplay("0.5").toString()).toBe("1");
    expect(roundDisplay("2.5").toString()).toBe("3");
    expect(roundDisplay("-2.5").toString()).toBe("-3");
    expect(roundDisplay("1.005", "PAISA").toString()).toBe("1.01");
    expect(sessionAmount(s("0", "12.5", 0, "282.5")).toFixed(2)).toBe("3531.25");
    expect(sessionAmount(s(0, 0, 8264, 206.6)).toFixed(2)).toBe("0.00");
  });

  it("large values stay exact", () => {
    // 99999 × 99,999,999.9999 + 39.999 × 2,499,999.9999 = 9,999,999,997,489.9961002 → .00 (HALF_UP)
    expect(sessionAmount(s("99999", "39.999", "99999999.9999", "2499999.9999")).toFixed(2)).toBe("9999999997490.00");
  });

  it("Maan ↔ KG", () => {
    expect(toKg(1, 19).toString()).toBe("59");
    const { maan, kg } = splitKg(99);
    expect([maan.toString(), kg.toString()]).toEqual(["2", "19"]);
    expect(ratePerKgFromMaan(8264).toString()).toBe("206.6");
    expect(ratePerKgFromMaan(11300).toString()).toBe("282.5");
    expect(ratePerMaanFromKg(332.5).toString()).toBe("13300");
    expect(ratesMismatch(11000, 275)).toBe(false);
    expect(ratesMismatch(11000, 280)).toBe(true);
  });

  it("grouping: international vs lakh", () => {
    expect(formatNumber(943577, 0, "INTL")).toBe("943,577");
    expect(formatNumber(943577, 0, "LAKH")).toBe("9,43,577");
    expect(formatNumber(148752, 0, "LAKH")).toBe("1,48,752");
    expect(formatNumber(12345678, 0, "LAKH")).toBe("1,23,45,678");
    expect(formatNumber(-1500, 0, "INTL")).toBe("-1,500");
  });
});

describe("property-based", () => {
  const qty = fc.integer({ min: 0, max: 100000 }).map((n) => (n / 1000).toFixed(3));
  const rate = fc.integer({ min: 0, max: 10_000_000 }).map((n) => (n / 10000).toFixed(4));

  it("daily total == Σ rounded session amounts, and is 2 dp", () => {
    fc.assert(
      fc.property(qty, qty, rate, rate, qty, qty, rate, rate, (m1, k1, r1, rk1, m2, k2, r2, rk2) => {
        const a = s(m1, k1, r1, rk1);
        const b = s(m2, k2, r2, rk2);
        const total = dailyAmount(a, b);
        expect(total.eq(sessionAmount(a).plus(sessionAmount(b)))).toBe(true);
        expect(total.decimalPlaces()).toBeLessThanOrEqual(2);
      }),
    );
  });

  it("statement closing == prior + Σ debits − Σ credits", () => {
    const line = fc.record({
      txnType: fc.constantFrom("BANDHI_CHARGE", "MANDI_CHARGE", "PAYMENT", "DISCOUNT", "ADDITIONAL_CHARGE", "REFUND", "OPENING"),
      amt: fc.integer({ min: 1, max: 10_000_000 }),
    });
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), fc.array(line, { maxLength: 40 }), (prior, raw) => {
        const lines = raw.map((l) => {
          const credit = ["PAYMENT", "DISCOUNT"].includes(l.txnType);
          return { txnType: l.txnType, debit: credit ? 0 : l.amt / 100, credit: credit ? l.amt / 100 : 0 };
        });
        const t = computeStatementTotals(prior, lines);
        const expected = dec(prior).plus(sum(lines.map((l) => l.debit))).minus(sum(lines.map((l) => l.credit)));
        expect(t.closingBalance.eq(expected)).toBe(true);
      }),
    );
  });

  it("FIFO allocation never exceeds payment or bucket amounts", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100000 }), { maxLength: 8 }),
        fc.array(fc.integer({ min: 0, max: 100000 }), { maxLength: 8 }),
        (pays, dues) => {
          const r = allocateFifo(
            pays.map((a, i) => ({ id: `p${i}`, amount: a })),
            dues.map((d, i) => ({ id: `s${i}`, due: d })),
          );
          const allocated = sum(r.allocations.map((a) => a.amount));
          expect(allocated.plus(r.advance).eq(sum(pays))).toBe(true);
          expect(allocated.lte(sum(dues))).toBe(true);
        },
      ),
    );
  });
});
