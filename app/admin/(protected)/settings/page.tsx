import { setupChecklist } from "@/lib/admin/setupChecklist";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  const items = setupChecklist(process.env);
  const missing = items.filter((item) => !item.ok).length;
  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Settings" subtitle={<>What is configured on this deployment. Only whether each setting is present is shown, never its value. Change them in Vercel &gt; Settings &gt; Environment Variables, then redeploy. Per-business settings (profile, subscription, owners) are in each business&apos;s own Settings page.</>} />
      </div>
      <p className={`rounded-xl border px-4 py-3 text-sm ${missing === 0 ? "border-emerald-200 bg-emerald-50/70 text-emerald-800" : "border-amber-200 bg-amber-50/70 text-amber-800"}`} role="status">
        {missing === 0 ? "Everything below is set." : `${missing} setting${missing === 1 ? "" : "s"} need attention.`}
      </p>
      <ul className="glass-panel divide-y divide-slate-200/70 overflow-hidden rounded-xl">
        {items.map((item) => (
          <li key={item.name} className="flex items-start gap-3 px-4 py-3">
            <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.ok ? "bg-emerald-500" : "bg-red-500"}`} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-medium text-slate-800">{item.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{item.note}</p>
              {!item.ok && <p className="mt-1 text-xs text-slate-700"><span className="font-semibold">To fix: </span>{item.fix}</p>}
            </div>
            <span className={`shrink-0 text-xs font-medium ${item.ok ? "text-emerald-700" : "text-red-700"}`}>{item.ok ? "Set" : "Not set"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
