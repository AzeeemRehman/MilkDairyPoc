import { requireUser } from "@/lib/auth";
import { dec } from "@/lib/calc";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { statementWorkbook, xlsxResponse } from "@/lib/xlsx";
import { getStatement } from "@/server/services/statements";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(PERMISSIONS.STATEMENTS_VIEW);
    const { id } = await params;
    const [{ st, detail }, s] = await Promise.all([getStatement(id), getSettings()]);
    const f = (v: unknown) => dec(v as string).toFixed(2);
    const buf = await statementWorkbook(
      s,
      detail,
      {
        openingBalance: f(st.openingBalance),
        totalBandhi: f(st.totalBandhi),
        totalMandi: f(st.totalMandi),
        totalMilk: f(st.totalMilk),
        additionalCharges: f(st.additionalCharges),
        payments: f(st.payments),
        credits: f(st.credits),
        closingBalance: f(st.closingBalance),
      },
      `${st.statementNo} v${st.version}`,
    );
    return xlsxResponse(buf, `${st.statementNo}-v${st.version}-${st.customer.name}.xlsx`);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
