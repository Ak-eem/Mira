/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // General security headers for non-embedded routes
        source: "/((?!chat/).*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'self';",
          },
        ],
      },
      {
        // Customer-facing chat widget routes (/chat/[businessSlug])
        // Must allow frame embedding via frame-ancestors * so third-party
        // websites can embed the widget in an <iframe> (see public/embed.js).
        // X-Frame-Options is omitted here so legacy browsers do not block embedding.
        source: "/chat/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors *;",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
