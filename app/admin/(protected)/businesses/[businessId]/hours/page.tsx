import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HoursForm } from "./HoursForm";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function HoursPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
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
      <Link href={`/admin/businesses/${businessId}`} className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">Hours</h1>
      <HoursForm businessId={businessId} initialDays={byDay} />
    </div>
  );
}
