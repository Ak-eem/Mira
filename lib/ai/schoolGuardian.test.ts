import { Module } from "node:module";

// buildContext.ts imports createServiceRoleClient, which imports
// "server-only" -- that throws outside Next's bundler (it can't tell this
// tsx test run from a real client bundle). Stubbed for this process only;
// the app's own build is unaffected. Same approach as lib/paystack.test.ts.
type ModuleLoader = (request: string, ...rest: unknown[]) => unknown;
const originalLoad = (Module as unknown as { _load: ModuleLoader })._load;
(Module as unknown as { _load: ModuleLoader })._load = function patchedLoad(request, ...rest) {
  if (request === "server-only") return {};
  return originalLoad.call(Module, request, ...rest);
};

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

async function run() {
  const { isSchoolGuardianLookupEligible } = await import("./buildContext");

  // The gate that decides whether a per-guardian student lookup runs at
  // all. Getting any of these wrong either means a school business never
  // gets the feature (channel/token case), or -- the dangerous direction
  // -- a non-school business's web-chat visitor somehow triggers a
  // guardian lookup meant for a completely different kind of business.
  check(
    isSchoolGuardianLookupEligible({ channel: "whatsapp", businessType: "school", sessionToken: "wa_2348031234567" }) === true,
    "whatsapp + school business + wa_ token: eligible",
  );

  check(
    isSchoolGuardianLookupEligible({ channel: "web", businessType: "school", sessionToken: "web_abc123" }) === false,
    "web chat on a school business: NOT eligible (guardian context is WhatsApp-only)",
  );

  check(
    isSchoolGuardianLookupEligible({ channel: "email", businessType: "school", sessionToken: "email_x" }) === false,
    "email on a school business: NOT eligible",
  );

  check(
    isSchoolGuardianLookupEligible({ channel: "whatsapp", businessType: "general", sessionToken: "wa_2348031234567" }) === false,
    "whatsapp on a non-school business: NOT eligible (no guardian lookup for a fashion store, etc.)",
  );

  check(
    isSchoolGuardianLookupEligible({ channel: "whatsapp", businessType: null, sessionToken: "wa_2348031234567" }) === false,
    "whatsapp with business_type missing/null: NOT eligible (fails closed, not open)",
  );

  check(
    isSchoolGuardianLookupEligible({ channel: "whatsapp", businessType: "school", sessionToken: "web_2348031234567" }) === false,
    "whatsapp channel but a non-wa_ session token: NOT eligible (malformed/unexpected token never reaches the phone-extraction step)",
  );
}

void run();
