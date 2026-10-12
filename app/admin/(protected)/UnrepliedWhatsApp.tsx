import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { countUnrepliedWhatsApp } from "@/lib/whatsapp/sweepUnreplied";

function ago(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

// Platform-wide: every business's WhatsApp messages in one count. The queue table is
// service-role only, and this page is already behind the admin gate in the layout.
export async function UnrepliedWhatsApp() {
  let counts;
  try {
    counts = await countUnrepliedWhatsApp(createServiceRoleClient());
  } catch {
    return null;
  }
  const attention = counts.waiting + counts.gaveUp > 0;
  return (
    <div className={`rounded-xl p-5 ${attention ? "border border-amber-300/50 bg-amber-50/70" : "glass-panel"}`}>
      <p className={`text-sm font-medium ${attention ? "text-amber-800" : "text-slate-700"}`}>WhatsApp messages not answered</p>
      {attention ? (
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {counts.waiting > 0 && (
            <li>
              <span className="font-semibold">{counts.waiting}</span> still being retried automatically
              {counts.oldestWaitingAt ? ` (oldest ${ago(counts.oldestWaitingAt)} old)` : ""}.
            </li>
          )}
          {counts.gaveUp > 0 && (
            <li>
              <span className="font-semibold">{counts.gaveUp}</span> gave up after every attempt in the last 30 days. Those customers never got a reply and need a person to follow up.
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Every WhatsApp message has been answered.</p>
      )}
    </div>
  );
}
