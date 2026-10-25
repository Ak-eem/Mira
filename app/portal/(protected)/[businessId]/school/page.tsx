import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { SchoolManager } from "./SchoolManager";

const STUDENT_PAGE_LIMIT = 300;

export default async function SchoolPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (membership?.role !== "owner") {
    return <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">Only the business owner can edit this.</p>;
  }
  if (membership.businessType !== "school") {
    return <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">School tools aren&apos;t switched on for this business. Ask us to turn on school mode.</p>;
  }

  const supabase = await createClient();
  const [sessions, terms, classes, fees, students, studentCount] = await Promise.all([
    supabase.from("school_academic_sessions").select("id, name, start_date, end_date, is_current").eq("business_id", businessId).order("start_date", { ascending: false }),
    supabase.from("school_terms").select("id, academic_session_id, name, sequence, start_date, end_date").eq("business_id", businessId).order("sequence"),
    supabase.from("school_classes").select("id, name, arm").eq("business_id", businessId).order("name").order("arm"),
    supabase.from("school_fee_schedules").select("class_id, term_id, amount").eq("business_id", businessId),
    supabase.from("school_students").select("id, admission_no, full_name, class_id, guardian_name, guardian_phone").eq("business_id", businessId).order("admission_no").limit(STUDENT_PAGE_LIMIT),
    supabase.from("school_students").select("id", { count: "exact", head: true }).eq("business_id", businessId),
  ]);

  return (
    <div>
      <PageHeader title="School" subtitle="The calendar, classes, fees and students Mira answers from. Changes reach customers within about a minute." />
      <SchoolManager
        businessId={businessId}
        sessions={sessions.data ?? []}
        terms={terms.data ?? []}
        classes={classes.data ?? []}
        fees={(fees.data ?? []).map((f) => ({ classId: f.class_id, termId: f.term_id, amount: Number(f.amount) }))}
        students={students.data ?? []}
        studentTotal={studentCount.count ?? 0}
      />
    </div>
  );
}
