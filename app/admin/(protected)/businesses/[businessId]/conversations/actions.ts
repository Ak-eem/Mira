"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";

// Clears the needs_human flag Mira sets when a customer asks for a person
// or gets stuck in a loop (see lib/chat/handoff.ts). Bound with
// businessId/conversationId via .bind() and used directly as a <form
// action> (see the conversation thread page), which requires a
// void-returning function -- failures are logged server-side rather than
// surfaced back to a client component, same fire-and-forget spirit as
// logActivity itself.
export async function resolveHandoff(businessId: string, conversationId: string): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    console.error("resolveHandoff called without an authenticated admin");
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ needs_human: false })
    .eq("id", conversationId)
    .eq("business_id", businessId);

  if (error) {
    console.error("Failed to resolve handoff flag:", error);
    return;
  }

  await logActivity(
    businessId,
    "conversation",
    conversationId,
    "updated",
    "Conversation marked resolved",
    "admin_ui",
  );

  revalidatePath(`/admin/businesses/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/admin/businesses/${businessId}/conversations`);
  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath(`/admin`);
}
