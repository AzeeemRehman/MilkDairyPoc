import { requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { readAttachment } from "@/server/services/expenses";

/** Receipts are stored outside the web root and only served to authorised users. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(PERMISSIONS.EXPENSES_MANAGE, PERMISSIONS.REPORTS_VIEW);
    const { id } = await params;
    const f = await readAttachment(id);
    return new Response(new Uint8Array(f.buf), {
      headers: {
        "Content-Type": f.type,
        "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
