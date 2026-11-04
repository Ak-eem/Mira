import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// Preview-before-publish replays real customer messages against a draft prompt.
// It must be IMPOSSIBLE for that to message a customer, record a reply, flag a
// conversation or touch an order, so the preview code may not import anything
// that can. (lib/ai/previewReplay.test.ts also checks this, and that the files
// never call a Supabase write.)
const SIDE_EFFECT_MODULES = [
  "@/lib/whatsapp/*",
  "@/lib/email/*",
  "@/lib/notifications/*",
  "@/lib/nudges/*",
  "@/lib/chat/processMessage",
  "@/lib/chat/processIncomingMessage",
  "@/lib/chat/orderTaking",
  "@/lib/chat/closeConversation",
  "@/lib/chat/clearHandoff",
  "@/lib/orders/transition",
];

export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    files: ["lib/ai/previewReplay.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [...SIDE_EFFECT_MODULES, "@/lib/supabase/service-role"],
              message: "Preview replay must stay read-only: it may not import anything that sends, records or changes data.",
            },
          ],
        },
      ],
    },
  },
  {
    // "Ask your data" reads the owner's data with the signed-in user's own client. Only api.ts (the status and
    // rate-limit gates) may touch the service-role client, and it never reads business data with it.
    files: ["lib/ask/**/*.ts"],
    ignores: ["lib/ask/api.ts", "lib/ask/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/service-role"],
              message: "Ask-your-data lookups must run under the signed-in user's own row-level security, never the service-role client.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["app/api/**/prompt-preview/**/*.ts", "lib/ai/promptPreviewApi.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: SIDE_EFFECT_MODULES,
              message: "Preview endpoints must stay read-only: they may not import anything that sends, records or changes data.",
            },
          ],
        },
      ],
    },
  },
]);
