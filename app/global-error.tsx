"use client";

// This page replaces the whole document when the root layout itself fails, so the
// app's stylesheet may not be loaded. It is styled inline (same cream and deep green
// as the rest of Mira) so it looks right even then.
const INK = "#0f2a22";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f3ecdd", color: INK, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "4rem 1.5rem" }}>
          <section style={{ width: "100%", maxWidth: "32rem", textAlign: "center", background: "#fffdf8", borderRadius: "1.25rem", padding: "2rem", boxShadow: "0 0 0 1px rgba(15,42,34,0.08)" }}>
            <div aria-hidden style={{ margin: "0 auto 1.25rem", display: "flex", height: "3.5rem", width: "3.5rem", alignItems: "center", justifyContent: "center", borderRadius: "1rem", background: INK, color: "#fff", fontSize: "1.5rem", fontWeight: 600 }}>
              M
            </div>
            <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.5rem", fontWeight: 600 }}>Mira needs a moment</h1>
            <p style={{ margin: "0 0 1.75rem", fontSize: "0.9375rem", lineHeight: 1.5, color: "#475569" }}>
              The app encountered an unexpected problem. Try again to reload Mira.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{ minHeight: "2.75rem", cursor: "pointer", border: 0, borderRadius: "0.75rem", background: INK, color: "#fff", padding: "0.5rem 1.25rem", fontSize: "0.9375rem", fontWeight: 600 }}
            >
              Reload Mira
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
