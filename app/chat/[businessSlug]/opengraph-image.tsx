import { ImageResponse } from "next/og";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const supabase = createServiceRoleClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("name, brand_color")
    .eq("slug", businessSlug)
    .maybeSingle();

  const name = business?.name ?? "Store Assistant";
  const initial = name.trim().charAt(0).toUpperCase() || "M";
  const brandColor = business?.brand_color || "#0f2a22";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#f7f6f2",
          padding: "60px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                backgroundColor: "#0f2a22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  backgroundColor: "#f2a900",
                }}
              />
            </div>
            <span style={{ fontSize: "28px", fontWeight: 700, color: "#0f2a22", letterSpacing: "-0.5px" }}>
              Mira
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              backgroundColor: "#e8f5e9",
              padding: "10px 24px",
              borderRadius: "9999px",
              border: "1px solid #c8e6c9",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "9999px",
                backgroundColor: "#2e7d32",
              }}
            />
            <span style={{ fontSize: "20px", fontWeight: 600, color: "#1b5e20" }}>
              Online · 24/7 Instant Assistant
            </span>
          </div>
        </div>

        {/* Center / Hero Card */}
        <div style={{ display: "flex", alignItems: "center", gap: "40px", width: "100%" }}>
          <div
            style={{
              width: "130px",
              height: "130px",
              borderRadius: "9999px",
              backgroundColor: brandColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: "64px",
              fontWeight: 800,
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
            }}
          >
            {initial}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
            <h1
              style={{
                fontSize: "58px",
                fontWeight: 800,
                color: "#18181b",
                margin: 0,
                lineHeight: 1.1,
                letterSpacing: "-1px",
              }}
            >
              {name}
            </h1>
            <p
              style={{
                fontSize: "26px",
                fontWeight: 500,
                color: "#52525b",
                margin: 0,
              }}
            >
              Ask about available items, sizes, prices & order 24/7
            </p>
          </div>
        </div>

        {/* Feature Badges */}
        <div style={{ display: "flex", gap: "16px", width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "#ffffff",
              border: "1px solid #e4e4e7",
              borderRadius: "9999px",
              padding: "10px 20px",
              fontSize: "18px",
              color: "#3f3f46",
              fontWeight: 600,
            }}
          >
            👗 Live Dress & Shoe Stock
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "#ffffff",
              border: "1px solid #e4e4e7",
              borderRadius: "9999px",
              padding: "10px 20px",
              fontSize: "18px",
              color: "#3f3f46",
              fontWeight: 600,
            }}
          >
            ⚡ Instant Price & Size Check
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "#ffffff",
              border: "1px solid #e4e4e7",
              borderRadius: "9999px",
              padding: "10px 20px",
              fontSize: "18px",
              color: "#3f3f46",
              fontWeight: 600,
            }}
          >
            📦 Direct Orders & Tracking
          </div>
        </div>

        {/* Bottom Bar / Action Callout */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "2px solid #e4e4e7",
            paddingTop: "24px",
            width: "100%",
          }}
        >
          <span style={{ fontSize: "22px", color: "#71717a", fontWeight: 500 }}>
            💬 Tap to chat in your browser with zero wait time
          </span>
          <div
            style={{
              backgroundColor: "#0f2a22",
              color: "#ffffff",
              padding: "14px 32px",
              borderRadius: "9999px",
              fontSize: "20px",
              fontWeight: 700,
            }}
          >
            Chat with {name} →
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
