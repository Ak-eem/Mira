export default async function BusinessAnalyticsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  await params;
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Business Analytics</h1>
      <div className="glass-panel rounded-xl p-6">
        <p className="text-sm text-slate-600">
          This business&apos;s own conversation and AI performance numbers will live here.
          Same as the platform-level Mira Analytics page — waiting on AI-response logging
          to exist before showing real numbers instead of placeholders.
        </p>
      </div>
    </div>
  );
}
