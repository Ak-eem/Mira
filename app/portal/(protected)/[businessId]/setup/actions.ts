"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeAnswers } from "@/lib/onboarding";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { logActivity } from "@/lib/activityLog";
import { buildFashionStarter, normalizeFashionAnswers } from "@/lib/fashionStarter";

// Saves the setup wizard's answers (or a skip: every answer null) and marks
// onboarding done so the dashboard stops redirecting here.
//
// Runs as the signed-in user, not the service role. Who may do this is
// decided in the database: complete_onboarding checks the caller is the
// business OWNER (or a platform admin) and can write only these four
// columns, so a crafted call can't edit anything else or another business.
export async function completeOnboarding(businessId: string, answers: unknown): Promise<{ error: string | null }> {
  const parsed = normalizeAnswers(answers);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding", {
    p_business_id: businessId,
    p_wants_email_channel: parsed.answers.wantsEmailChannel,
    p_tracks_inventory: parsed.answers.tracksInventory,
    p_logistics_provider: parsed.answers.logisticsProvider,
  });
  if (error) {
    if (error.code === "42501") return { error: "Only the business owner can do this." };
    console.error("completeOnboarding failed", error);
    return { error: "Couldn't save your answers. Please try again." };
  }

  revalidatePath(`/portal/${businessId}`);
  return { error: null };
}

// Adds the fashion store's starter FAQs and returns policy, built only from what the
// owner answered in the wizard (see lib/fashionStarter.ts). Safe to run twice: anything
// whose question/title already exists is skipped, so it never duplicates or overwrites
// something the owner (or the website import) already wrote. Owner-only; the RLS
// policies from migration 0060 are the real boundary.
export async function seedFashionStarter(businessId: string, answers: unknown): Promise<{ error: string | null; added: number }> {
  const parsed = normalizeFashionAnswers(answers);
  if (!parsed.ok) return { error: parsed.error, added: 0 };

  const owner = await getCurrentBusinessOwner();
  if (owner?.businesses.find((b) => b.id === businessId)?.role !== "owner") return { error: "Only the business owner can do this.", added: 0 };

  const items = buildFashionStarter(parsed.answers);
  if (items.faqs.length === 0 && items.policies.length === 0) return { error: null, added: 0 };

  const supabase = await createClient();
  const [{ data: existingFaqs }, { data: existingPolicies }] = await Promise.all([
    supabase.from("faqs").select("question").eq("business_id", businessId),
    supabase.from("policies").select("title").eq("business_id", businessId),
  ]);
  const haveFaq = new Set((existingFaqs ?? []).map((f) => f.question.trim().toLowerCase()));
  const havePolicy = new Set((existingPolicies ?? []).map((p) => p.title.trim().toLowerCase()));

  const newFaqs = items.faqs.filter((f) => !haveFaq.has(f.question.toLowerCase())).map((f) => ({ business_id: businessId, ...f }));
  const newPolicies = items.policies.filter((p) => !havePolicy.has(p.title.toLowerCase())).map((p) => ({ business_id: businessId, ...p }));

  if (newFaqs.length > 0) {
    const { error } = await supabase.from("faqs").insert(newFaqs);
    if (error) { console.error("seedFashionStarter faqs failed", error); return { error: "Couldn't add your starter answers. Please try again.", added: 0 }; }
  }
  if (newPolicies.length > 0) {
    const { error } = await supabase.from("policies").insert(newPolicies);
    if (error) { console.error("seedFashionStarter policies failed", error); return { error: "Couldn't add your returns policy. Please try again.", added: newFaqs.length }; }
  }

  const added = newFaqs.length + newPolicies.length;
  if (added > 0) await logActivity(businessId, "business", businessId, "updated", `Fashion starter answers added during setup (${added})`, "portal_command");
  revalidatePath(`/portal/${businessId}`);
  return { error: null, added };
}
