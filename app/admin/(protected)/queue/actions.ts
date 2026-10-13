"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { retryQueueRow, type RetryChannel } from "@/lib/queue/retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function retryMessageAction(formData: FormData) {
  // Platform admins only. The page is already behind the admin layout, but a server action is a public
  // endpoint, so it checks for itself.
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  const channel = formData.get("channel");
  const id = String(formData.get("id") ?? "");
  if ((channel !== "whatsapp" && channel !== "email") || !UUID.test(id)) redirect("/admin/queue?result=" + encodeURIComponent("Invalid request."));

  const result = await retryQueueRow(createServiceRoleClient(), channel as RetryChannel, id);
  revalidatePath("/admin/queue");
  redirect("/admin/queue?result=" + encodeURIComponent(result.ok ? "Retried - the customer should have their reply now." : `Retry failed: ${result.reason}`));
}
