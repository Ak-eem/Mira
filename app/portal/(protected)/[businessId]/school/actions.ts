"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { classLabel, parseAmountNaira, parseClassLabel, parseStudentRows, validateDateRange } from "@/lib/school/input";

// School data changes what Mira tells parents, so it is owner-only (not staff). The real
// boundary is the is_business_owner() RLS policy on every school_* table; this check just
// gives a clear message and stops obviously wrong calls early.
async function requireOwner(businessId: string): Promise<boolean> {
  const owner = await getCurrentBusinessOwner();
  return owner?.businesses.find((b) => b.id === businessId)?.role === "owner";
}

type Result = { error: string | null };
const NOT_ALLOWED: Result = { error: "Only the business owner can change school data." };

function friendly(error: { code?: string; message: string }, duplicateMessage: string): string {
  if (error.code === "23505") return duplicateMessage;
  if (error.code === "23503") return "That item is still being used by something else. Remove what depends on it first.";
  return error.message;
}

function done(businessId: string): Result {
  revalidatePath(`/portal/${businessId}/school`);
  return { error: null };
}

export async function addSession(input: { businessId: string; name: string; startDate: string; endDate: string; makeCurrent: boolean }): Promise<Result> {
  if (!(await requireOwner(input.businessId))) return NOT_ALLOWED;
  const name = input.name.trim();
  if (!name) return { error: "Give the session a name, e.g. 2026/2027." };
  const dateError = validateDateRange(input.startDate, input.endDate);
  if (dateError) return { error: dateError };

  const supabase = await createClient();
  // Only one session may be current (unique index), so clear the old one first.
  if (input.makeCurrent) {
    const { error: clearError } = await supabase.from("school_academic_sessions").update({ is_current: false }).eq("business_id", input.businessId).eq("is_current", true);
    if (clearError) return { error: clearError.message };
  }
  const { error } = await supabase.from("school_academic_sessions").insert({
    business_id: input.businessId, name, start_date: input.startDate, end_date: input.endDate, is_current: input.makeCurrent,
  });
  if (error) return { error: friendly(error, `A session called "${name}" already exists.`) };
  return done(input.businessId);
}

export async function setCurrentSession(input: { businessId: string; sessionId: string }): Promise<Result> {
  if (!(await requireOwner(input.businessId))) return NOT_ALLOWED;
  const supabase = await createClient();
  const { error: clearError } = await supabase.from("school_academic_sessions").update({ is_current: false }).eq("business_id", input.businessId).eq("is_current", true);
  if (clearError) return { error: clearError.message };
  const { error } = await supabase.from("school_academic_sessions").update({ is_current: true }).eq("business_id", input.businessId).eq("id", input.sessionId);
  if (error) return { error: error.message };
  return done(input.businessId);
}

export async function deleteSession(input: { businessId: string; sessionId: string }): Promise<Result> {
  if (!(await requireOwner(input.businessId))) return NOT_ALLOWED;
  const supabase = await createClient();
  const { error } = await supabase.from("school_academic_sessions").delete().eq("business_id", input.businessId).eq("id", input.sessionId);
  if (error) return { error: friendly(error, "Could not delete the session.") };
  return done(input.businessId);
}

export async function addTerm(input: { businessId: string; sessionId: string; name: string; startDate: string; endDate: string }): Promise<Result> {
  if (!(await requireOwner(input.businessId))) return NOT_ALLOWED;
  const name = input.name.trim();
  if (!name) return { error: "Give the term a name, e.g. First Term." };
  const dateError = validateDateRange(input.startDate, input.endDate);
  if (dateError) return { error: dateError };

  const supabase = await createClient();
  const { count } = await supabase.from("school_terms").select("id", { count: "exact", head: true }).eq("business_id", input.businessId).eq("academic_session_id", input.sessionId);
  const { error } = await supabase.from("school_terms").insert({
    business_id: input.businessId, academic_session_id: input.sessionId, name, sequence: (count ?? 0) + 1, start_date: input.startDate, end_date: input.endDate,
  });
  if (error) return { error: friendly(error, `This session already has a term called "${name}".`) };
  return done(input.businessId);
}

export async function deleteTerm(input: { businessId: string; termId: string }): Promise<Result> {
  if (!(await requireOwner(input.businessId))) return NOT_ALLOWED;
  const supabase = await createClient();
  const { error } = await supabase.from("school_terms").delete().eq("business_id", input.businessId).eq("id", input.termId);
  if (error) return { error: friendly(error, "Could not delete the term.") };
  return done(input.businessId);
}

export async function addClass(input: { businessId: string; label: string }): Promise<Result> {
  if (!(await requireOwner(input.businessId))) return NOT_ALLOWED;
  const ref = parseClassLabel(input.label);
  if (!ref) return { error: "Enter a class, e.g. JSS 1 A." };
  const supabase = await createClient();
  const { error } = await supabase.from("school_classes").insert({ business_id: input.businessId, name: ref.name, arm: ref.arm });
  if (error) return { error: friendly(error, `${classLabel(ref)} already exists.`) };
  return done(input.businessId);
}

export async function deleteClass(input: { businessId: string; classId: string }): Promise<Result> {
  if (!(await requireOwner(input.businessId))) return NOT_ALLOWED;
  const supabase = await createClient();
  const { error } = await supabase.from("school_classes").delete().eq("business_id", input.businessId).eq("id", input.classId);
  if (error) return { error: error.code === "23503" ? "This class still has students. Remove or move them first." : error.message };
  return done(input.businessId);
}

// An empty amount clears the fee for that class and term.
export async function saveFee(input: { businessId: string; classId: string; termId: string; amount: string }): Promise<Result> {
  if (!(await requireOwner(input.businessId))) return NOT_ALLOWED;
  const supabase = await createClient();
  if (!input.amount.trim()) {
    const { error } = await supabase.from("school_fee_schedules").delete().eq("business_id", input.businessId).eq("class_id", input.classId).eq("term_id", input.termId);
    if (error) return { error: error.message };
    return done(input.businessId);
  }
  const amount = parseAmountNaira(input.amount);
  if (amount === null) return { error: "Enter the fee as a number, e.g. 150000." };
  const { error } = await supabase.from("school_fee_schedules").upsert(
    { business_id: input.businessId, class_id: input.classId, term_id: input.termId, amount },
    { onConflict: "business_id,class_id,term_id" },
  );
  if (error) return { error: error.message };
  return done(input.businessId);
}

export type ImportResult = { error: string | null; imported: number; createdClasses: string[]; rowErrors: { line: number; message: string }[] };

// Adds students, creating any class that doesn't exist yet. Re-importing the same admission
// number updates that student, so fixing a typo and importing again is safe.
export async function importStudents(input: { businessId: string; text: string }): Promise<ImportResult> {
  const empty = { imported: 0, createdClasses: [], rowErrors: [] };
  if (!(await requireOwner(input.businessId))) return { ...empty, error: NOT_ALLOWED.error };

  const { rows, errors } = parseStudentRows(input.text);
  if (rows.length === 0) return { ...empty, rowErrors: errors, error: errors.length ? "Nothing could be imported. Fix the rows below." : "Paste at least one student." };

  const supabase = await createClient();
  const { data: existing, error: classError } = await supabase.from("school_classes").select("id, name, arm").eq("business_id", input.businessId);
  if (classError) return { ...empty, error: classError.message };

  const idByLabel = new Map<string, string>();
  for (const c of existing ?? []) idByLabel.set(classLabel(c).toLowerCase(), c.id);

  const missing = new Map<string, { name: string; arm: string }>();
  for (const row of rows) {
    const key = classLabel(row.classRef).toLowerCase();
    if (!idByLabel.has(key) && !missing.has(key)) missing.set(key, row.classRef);
  }
  const createdClasses: string[] = [];
  if (missing.size > 0) {
    const { data: created, error: createError } = await supabase
      .from("school_classes")
      .insert([...missing.values()].map((c) => ({ business_id: input.businessId, name: c.name, arm: c.arm })))
      .select("id, name, arm");
    if (createError) return { ...empty, error: createError.message };
    for (const c of created ?? []) { idByLabel.set(classLabel(c).toLowerCase(), c.id); createdClasses.push(classLabel(c)); }
  }

  const payload = rows.map((row) => ({
    business_id: input.businessId,
    class_id: idByLabel.get(classLabel(row.classRef).toLowerCase())!,
    admission_no: row.admissionNo,
    full_name: row.fullName,
    guardian_name: row.guardianName,
    guardian_phone: row.guardianPhone,
    guardian_email: row.guardianEmail,
  }));
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await supabase.from("school_students").upsert(payload.slice(i, i + 200), { onConflict: "business_id,admission_no" });
    if (error) return { error: `Imported ${i} of ${payload.length} students, then hit an error: ${error.message}`, imported: i, createdClasses, rowErrors: errors };
  }
  revalidatePath(`/portal/${input.businessId}/school`);
  return { error: null, imported: payload.length, createdClasses, rowErrors: errors };
}

export async function deleteStudent(input: { businessId: string; studentId: string }): Promise<Result> {
  if (!(await requireOwner(input.businessId))) return NOT_ALLOWED;
  const supabase = await createClient();
  const { error } = await supabase.from("school_students").delete().eq("business_id", input.businessId).eq("id", input.studentId);
  if (error) return { error: error.message };
  return done(input.businessId);
}
