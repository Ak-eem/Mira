"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { updateAgentSettings } from "@/lib/agentSettings";
import type { ProviderName } from "@/lib/ai/geminiFetch";

// Lets Mira staff configure this on an owner's behalf (e.g. walking a
// confused owner through it over a call) -- staff access to the admin
// Command Center itself is unaffected by this flag either way (see
// supabase/migrations/0047_command_agent_settings.sql), this only ever
// gates the portal inventory assistant.
export async function saveAgentSettingsAsAdmin(businessId: string, enabled: boolean, provider: ProviderName) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const { error } = await updateAgentSettings(businessId, enabled, provider);
  if (error) return { error };

  revalidatePath(`/admin/businesses/${businessId}/settings`);
  return { error: null };
}
