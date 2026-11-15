import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { dec } from "@/lib/calc";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { PrintButton } from "@/components/PrintButton";
import { StatementDocument } from "@/components/StatementDocument";
import { Badge } from "@/components/ui";
import { getStatement } from "@/server/services/statements";

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage(PERMISSIONS.STATEMENTS_VIEW);
  const { id } = await params;
  const [{ st, detail }, s] = await Promise.all([getStatement(id), getSettings()]);
  const f = (v: unknown) => dec(v as string).toFixed(2);
  // Totals come from the immutable snapshot; line items are re-read from source rows.
  const linesChanged = !dec(st.closingBalance).eq(detail.totals.closingBalance);

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <Link href={`/statements?customerId=${st.customerId}&period=${st.period}`} className="text-brand-800 hover:underline">
            ← Back
          </Link>{" "}
          <Badge tone={st.status === "FINAL" ? "green" : "slate"}>{st.status}</Badge>{" "}
          {st.status === "FINAL" && <Badge tone={st.paidStatus === "PAID" ? "green" : st.paidStatus === "PARTIAL" ? "amber" : "red"}>{st.paidStatus}</Badge>}
        </div>
        <div className="flex gap-2">
          <a href={`/api/v1/statements/${st.id}/xlsx`} className="btn-secondary">
            Excel
          </a>
          <PrintButton />
        </div>
      </div>
      {linesChanged && (
        <p className="no-print mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          The period was changed after this version was generated. The summary below shows this version&apos;s saved figures; line items show current data. See the latest version for matching detail.
        </p>
      )}
      <StatementDocument
        s={s}
        customer={st.customer}
        detail={detail}
        summary={{
          openingBalance: f(st.openingBalance),
          totalBandhi: f(st.totalBandhi),
          totalMandi: f(st.totalMandi),
          totalMilk: f(st.totalMilk),
          additionalCharges: f(st.additionalCharges),
          payments: f(st.payments),
          credits: f(st.credits),
          closingBalance: f(st.closingBalance),
        }}
        meta={{ statementNo: st.statementNo, version: st.version, status: st.status, generatedAt: st.generatedAt }}
      />
    </>
  );
}
