import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, isoDate, parseDate } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { reportWorkbook, xlsxResponse } from "@/lib/xlsx";
import { getLedger } from "@/server/services/ledger";
import { REPORTS, runReport, type Report, type ReportKey } from "@/server/services/reports";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const q = Object.fromEntries(new URL(req.url).searchParams);
    let report: Report;
    if (key === "ledger") {
      await requireUser(PERMISSIONS.STATEMENTS_VIEW);
      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: q.customerId } });
      const from = parseDate(q.from);
      const to = parseDate(q.to);
      const l = await getLedger(prisma, customer.id, from, to, false);
      report = {
        key: "ledger",
        title: "Complete Customer Ledger",
        subtitle: `${customer.name} · ${formatDate(from)} – ${formatDate(to)}`,
        sections: [
          {
            title: "Ledger",
            columns: [
              { key: "date", label: "Date", type: "date" },
              { key: "txnNo", label: "Txn #", type: "text" },
              { key: "type", label: "Type", type: "text" },
              { key: "description", label: "Description", type: "text" },
              { key: "debit", label: "Debit", type: "money" },
              { key: "credit", label: "Credit", type: "money" },
              { key: "balance", label: "Balance", type: "money" },
            ],
            rows: [
              { date: isoDate(from), txnNo: "", type: "", description: "Opening balance", debit: null, credit: null, balance: l.opening },
              ...l.rows.map((r) => ({ date: isoDate(r.txnDate), txnNo: r.txnNo, type: r.txnType, description: r.description, debit: r.debit, credit: r.credit, balance: r.balance })),
            ],
            totals: { debit: l.totalDebit, credit: l.totalCredit, balance: l.closing },
          },
        ],
      };
    } else {
      await requireUser(PERMISSIONS.REPORTS_VIEW);
      if (!REPORTS.some((r) => r.key === key)) return new Response("Unknown report", { status: 404 });
      report = await runReport(key as ReportKey, q);
    }
    const buf = await reportWorkbook(report, await getSettings());
    return xlsxResponse(buf, `${report.key}-${report.subtitle}.xlsx`);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Bad request", { status: 400 });
  }
}
