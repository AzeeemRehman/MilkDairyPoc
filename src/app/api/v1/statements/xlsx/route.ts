import { requireUser } from "@/lib/auth";
import { parseDate } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { statementWorkbook, xlsxResponse } from "@/lib/xlsx";
import { summaryFrom } from "@/components/StatementDocument";
import { previewStatement } from "@/server/services/statements";

/** Excel export of a live statement preview (any customer + date range). */
export async function GET(req: Request) {
  try {
    await requireUser(PERMISSIONS.STATEMENTS_VIEW);
    const q = new URL(req.url).searchParams;
    const detail = await previewStatement(q.get("customerId") ?? "", parseDate(q.get("from") ?? ""), parseDate(q.get("to") ?? ""));
    const buf = await statementWorkbook(await getSettings(), detail, summaryFrom(detail.totals), "(preview)");
    return xlsxResponse(buf, `statement-${detail.customer.name}-${q.get("from")}-${q.get("to")}.xlsx`);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Bad request", { status: 400 });
  }
}
