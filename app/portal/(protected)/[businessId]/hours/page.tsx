import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { HoursForm } from "@/app/admin/(protected)/businesses/[businessId]/hours/HoursForm";
import { PageHeader } from "@/components/ui/PageHeader";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function HoursPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const owner = await getCurrentBusinessOwner();
  if (owner?.businesses.find((b) => b.id === businessId)?.role !== "owner") {
    return <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">Only the business owner can edit this.</p>;
  }
  const supabase = await createClient();

  const { data: hours } = await supabase
    .from("business_hours")
    .select("day_of_week, opens_at, closes_at")
    .eq("business_id", businessId);

  const byDay = DAY_NAMES.map((name, index) => {
    const row = hours?.find((h) => h.day_of_week === index);
    return {
      day_of_week: index,
      name,
      closed: !row || !row.opens_at || !row.closes_at,
      opens_at: row?.opens_at?.slice(0, 5) ?? "09:00",
      closes_at: row?.closes_at?.slice(0, 5) ?? "17:00",
    };
  });

  return (
    <div className="max-w-lg">
      <PageHeader title="Opening hours" subtitle={<>When you are open, so Mira can answer whether you are open correctly.</>} />
      {byDay.every((day) => day.closed) && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
          You haven&apos;t set your opening hours yet. Until you do, Mira won&apos;t tell customers whether you are open or closed. Untick &quot;Closed&quot; on the days you open and set the times.
        </p>
      )}
      <HoursForm businessId={businessId} initialDays={byDay} />
    </div>
  );
}
