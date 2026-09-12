export default function PlatformSettingsPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Settings</h1>
      <div className="glass-panel rounded-xl p-6">
        <p className="text-sm text-slate-600">
          Platform-level settings live here — for now, per-business settings (profile,
          subscription, owners, danger zone) are still handled inside each business&apos;s
          own Settings page.
        </p>
      </div>
    </div>
  );
}
