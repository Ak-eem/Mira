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
  const { error } = await supabase
    .from("businesses")
    .update({ command_agent_enabled: enabled, command_agent_provider: provider })
    .eq("id", businessId);

  return { error: error?.message ?? null };
}
