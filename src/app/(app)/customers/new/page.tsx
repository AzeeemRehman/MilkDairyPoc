import { requirePage } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui";
import { CustomerForm } from "../CustomerForm";

export const metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  const user = await requirePage(PERMISSIONS.CUSTOMERS_EDIT);
  return (
    <>
      <PageHeader title="New customer" subtitle="After creating, set the Bandhi / Mandi rates on the Rates tab." />
      <Card>
        <CustomerForm canEditOpening={user.permissions.has(PERMISSIONS.ADJUSTMENTS_MANAGE)} />
      </Card>
    </>
  );
}
