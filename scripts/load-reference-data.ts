/**
 * Loads the reference sheet data (S.S.N Dairy Farm, 01–05/08/2026, previous balance 89,774)
 * so the statement can be checked against the paper sheet: Total Payable = Rs. 943,577.
 *
 *   npm run db:demo
 *
 * Skips if the customer already exists.
 */
import { prisma } from "../src/lib/db";
import { ROLE_MATRIX } from "../src/lib/permissions";
import { createCustomer, setRate } from "../src/server/services/customers";
import { createEntry } from "../src/server/services/milkEntries";
import { previewStatement } from "../src/server/services/statements";
import { systemActor } from "../src/server/services/types";
import { parseDate } from "../src/lib/dates";
import { formatMoney } from "../src/lib/format";

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: { code: "ADMIN" } } });
  const actor = systemActor(admin.id, ROLE_MATRIX.ADMIN.permissions);
  let c = await prisma.customer.findFirst({ where: { name: "S.S.N Dairy Farm" } });
  if (!c) {
    c = await createCustomer(actor, { name: "S.S.N Dairy Farm", customerType: "BOTH", city: "Lahore", openingBalance: "89774", openingBalanceDate: "2026-07-31" });
    for (const session of ["MORNING", "EVENING"] as const) {
      await setRate(actor, c.id, { supplyType: "BANDHI", session, defaultMaan: "9", defaultKg: "0", ratePerMaan: "8264", effectiveFrom: "2026-08-01" });
    }
    const b = (date: string) => ({
      customerId: c!.id,
      entryDate: date,
      supplyType: "BANDHI" as const,
      morning: { maan: "9", kg: "0", ratePerMaan: "8264", ratePerKg: "" },
      evening: { maan: "9", kg: "0", ratePerMaan: "8264", ratePerKg: "" },
    });
    const m = (date: string, mo: [string, string, string], ev: [string, string, string]) => ({
      customerId: c!.id,
      entryDate: date,
      supplyType: "MANDI" as const,
      morning: { maan: mo[0], kg: mo[1], ratePerMaan: mo[2], ratePerKg: "" },
      evening: { maan: ev[0], kg: ev[1], ratePerMaan: ev[2], ratePerKg: "" },
    });
    for (const d of ["01", "02", "03", "04", "05"]) await createEntry(actor, b(`2026-08-${d}`));
    await createEntry(actor, m("2026-08-01", ["0", "33", "11300"], ["0", "35", "11300"]));
    await createEntry(actor, m("2026-08-02", ["0", "15", "11300"], ["0", "24", "11000"]));
    await createEntry(actor, m("2026-08-03", ["0", "5", "11800"], ["0", "21", "11800"]));
    await createEntry(actor, m("2026-08-04", ["0", "23", "11300"], ["1", "19", "11800"]));
    await createEntry(actor, m("2026-08-05", ["1", "23", "12800"], ["2", "5", "13300"]));
    console.log("Loaded S.S.N Dairy Farm reference data.");
  } else {
    console.log("Reference customer already exists; not loading again.");
  }
  const s = await previewStatement(c.id, parseDate("2026-08-01"), parseDate("2026-08-05"));
  console.log(`Bandhi ${formatMoney(s.totals.totalBandhi)} · Mandi ${formatMoney(s.totals.totalMandi)} · Previous ${formatMoney(s.totals.openingBalance)} · Total payable ${formatMoney(s.totals.closingBalance, undefined, true)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
