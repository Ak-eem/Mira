"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";

export async function createPolicy(input: { businessId: string; title: string; content: string }) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) return { error: "Title and content are both required." };

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("policies")
    .insert({ business_id: input.businessId, title, content })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity(input.businessId, "policy", created?.id ?? null, "created", `Policy added: "${title}"`);
  return { error: null };
}

export async function updatePolicy(input: { policyId: string; title: string; content: string }) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) return { error: "Title and content are both required." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("policies")
    .select("business_id")
    .eq("id", input.policyId)
    .maybeSingle();

  const { error } = await supabase.from("policies").update({ title, content }).eq("id", input.policyId);
  if (error) return { error: error.message };

  if (existing) {
    await logActivity(existing.business_id, "policy", input.policyId, "updated", `Policy updated: "${title}"`);
  }
  return { error: null };
}

export async function deletePolicy(policyId: string) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("policies")
    .select("title, business_id")
    .eq("id", policyId)
    .maybeSingle();

  const { error } = await supabase.from("policies").delete().eq("id", policyId);
  if (error) return { error: error.message };

  if (existing) {
    await logActivity(existing.business_id, "policy", policyId, "deleted", `Policy removed: "${existing.title}"`);
  }
  return { error: null };
}
