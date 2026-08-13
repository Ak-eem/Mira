"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";

export async function createFaq(input: { businessId: string; question: string; answer: string; source?: "admin_ui" | "command_center" }) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question || !answer) return { error: "Question and answer are both required." };

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("faqs")
    .insert({ business_id: input.businessId, question, answer })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity(input.businessId, "faq", created?.id ?? null, "created", `FAQ added: "${question}"`, input.source ?? "admin_ui");
  return { error: null };
}

export async function updateFaq(input: { faqId: string; question: string; answer: string }) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question || !answer) return { error: "Question and answer are both required." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("faqs")
    .select("business_id")
    .eq("id", input.faqId)
    .maybeSingle();

  const { error } = await supabase.from("faqs").update({ question, answer }).eq("id", input.faqId);
  if (error) return { error: error.message };

  if (existing) {
    await logActivity(existing.business_id, "faq", input.faqId, "updated", `FAQ updated: "${question}"`);
  }
  return { error: null };
}

export async function deleteFaq(faqId: string) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("faqs")
    .select("question, business_id")
    .eq("id", faqId)
    .maybeSingle();

  const { error } = await supabase.from("faqs").delete().eq("id", faqId);
  if (error) return { error: error.message };

  if (existing) {
    await logActivity(existing.business_id, "faq", faqId, "deleted", `FAQ removed: "${existing.question}"`);
  }
  return { error: null };
}
