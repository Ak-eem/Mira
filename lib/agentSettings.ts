import { createClient } from "@/lib/supabase/server";
import type { ProviderName } from "@/lib/ai/geminiFetch";

export type AgentSettings = {
  enabled: boolean;
  provider: ProviderName;
};

export async function getAgentSettings(businessId: string): Promise<AgentSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("command_agent_enabled, command_agent_provider")
    .eq("id", businessId)
    .maybeSingle();

  return {
    enabled: data?.command_agent_enabled ?? false,
    provider: data?.command_agent_provider === "gemini" ? "gemini" : "groq",
  };
}

export async function updateAgentSettings(
  businessId: string,
  enabled: boolean,
  provider: ProviderName,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  // Via update_business_settings (migration 0054), not a direct .update():
  // owners have no UPDATE permission on businesses, so a direct write was
  // silently ignored for them. The function authorises owners / platform
  // admins itself and only touches these two columns.
  const { error } = await supabase.rpc("update_business_settings", {
    p_business_id: businessId,
    p_command_agent_enabled: enabled,
    p_command_agent_provider: provider,
  });

  return { error: error?.message ?? null };
}
