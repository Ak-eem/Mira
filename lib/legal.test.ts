// Run with `npx tsx lib/legal.test.ts`.
// The ownership agreement must (a) say exactly what the database says it said, (b) be required on every path that
// creates an account, and (c) be recorded before a business is provisioned. The database enforces (c) for real
// (supabase/tests/terms_acceptance.sql); these checks keep the screens honest and the wording in step.
import { readFileSync, readdirSync } from "node:fs";

function check(label: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${pass || !detail ? "" : ` (${detail})`}`);
  if (!pass) process.exitCode = 1;
}

const read = (path: string) => readFileSync(path, "utf8");

async function main() {
  const legal = await import("./legal");
  const { TERMS_VERSION, OWNERSHIP_STATEMENT, AGREEMENT_FULL_TEXT } = legal;

  // ---- the wording and the version match the database ----
  const migrations = readdirSync("supabase/migrations").filter((f) => /terms_acceptance/.test(f)).sort();
  check("a terms migration exists", migrations.length > 0);
  const acceptanceSql = migrations.map((f) => read(`supabase/migrations/${f}`)).join("\n");

  const stored = [...acceptanceSql.matchAll(/when '([0-9-]+)' then '([^']*)'/g)];
  const forCurrent = stored.find((m) => m[1] === TERMS_VERSION);
  check("the database holds the words for the app's TERMS_VERSION", Boolean(forCurrent));
  check("the words in the database are EXACTLY the words the app shows (AGREEMENT_FULL_TEXT)", forCurrent?.[2] === AGREEMENT_FULL_TEXT, forCurrent ? "they differ" : "version missing");

  const currentVersions = [...acceptanceSql.matchAll(/function public\.current_terms_version\(\)[\s\S]*?select '([0-9-]+)'::text/g)];
  check("current_terms_version() in the database equals TERMS_VERSION", currentVersions.at(-1)?.[1] === TERMS_VERSION);

  for (const phrase of ["I own this business", "legally authorised to act for it", "every website, WhatsApp number and email address", "Terms of Service", "Privacy Policy"]) {
    check(`the agreement says: "${phrase}"`, AGREEMENT_FULL_TEXT.includes(phrase));
  }
  check("the stored text starts with the ownership statement shown on the checkbox", AGREEMENT_FULL_TEXT.startsWith(OWNERSHIP_STATEMENT));
  check("the version is a date", /^\d{4}-\d{2}-\d{2}$/.test(TERMS_VERSION));

  // ---- the checkbox component shows the same statement and links to both documents ----
  const checkbox = read("components/legal/TermsAgreement.tsx");
  check("the checkbox shows OWNERSHIP_STATEMENT from lib/legal.ts (no second copy of the words)", /\{OWNERSHIP_STATEMENT\}/.test(checkbox) && !checkbox.includes("I own this business"));
  check("the checkbox links to the Terms and the Privacy Policy", /href="\/terms"/.test(checkbox) && /href="\/privacy"/.test(checkbox));
  check("the checkbox is a required input", /type="checkbox"[\s\S]*required/.test(checkbox));

  // ---- remembering a tick across the Google redirect ----
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  };
  check("nothing remembered at first", legal.readRememberedAgreement() === null);
  legal.rememberAgreement("google_signup");
  check("a tick is remembered with where it was given", legal.readRememberedAgreement()?.source === "google_signup" && legal.readRememberedAgreement()?.version === TERMS_VERSION);
  legal.forgetAgreement();
  check("forgetting clears it", legal.readRememberedAgreement() === null);
  store.set("mira.terms.agreed", JSON.stringify({ version: "1999-01-01", source: "signup" }));
  check("a tick for an OLD version does not count", legal.readRememberedAgreement() === null);
  store.set("mira.terms.agreed", "{not json");
  check("a corrupted value is ignored, not a crash", legal.readRememberedAgreement() === null);
  (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } } };
  check("blocked storage never throws", legal.readRememberedAgreement() === null && (() => { legal.rememberAgreement("signup"); legal.forgetAgreement(); return true; })());

  // ---- every account-creating screen requires it ----
  const portal = read("app/portal/signup/page.tsx");
  const quick = read("app/signup/SignupForm.tsx");
  const businessName = read("app/portal/signup/business-name/page.tsx");
  const at = (source: string, needle: string) => source.indexOf(needle);
  // Real calls only (comments in these files mention the function names too), whatever the line breaks.
  const callAt = (source: string, name: string) => source.search(new RegExp(`rpc\\(\\s*"${name}"`));
  const recordAt = (source: string) => callAt(source, "record_terms_acceptance");
  const provisionAt = (source: string) => callAt(source, "provision_new_business");

  // The quick signup form also serves people joining a team by invite; they are not creating a business, so they are
  // exempt (and the email signup page, which always creates a business, is never exempt).
  const guard = /if \((?:!inviteNext && )?!agreed\)/;
  for (const [name, source] of [["email signup", portal], ["quick signup", quick]] as const) {
    check(`${name}: shows the agreement checkbox`, /<TermsAgreement/.test(source));
    check(`${name}: refuses to submit unless it is ticked`, guard.test(source) && /disabled=\{[^}]*!agreed/.test(source));
    check(`${name}: the tick is checked BEFORE the account is created`, source.search(guard) > 0 && source.search(guard) < at(source, "auth.signUp("));
    check(`${name}: the Google button is off until it is ticked, and the tick is remembered before the redirect`, /<GoogleAuthButton[\s\S]*?disabled=\{(?:!inviteNext && )?!agreed\}[\s\S]*?onBeforeStart=\{(?:inviteNext \? undefined : )?\(\) => rememberAgreement\("google_signup"\)\}/.test(source));
    check(`${name}: uses the shared required-message`, source.includes("AGREEMENT_REQUIRED_MESSAGE"));
  }
  check("email signup is never exempt: no invite exemption on the page that always creates a business", !/inviteNext/.test(portal));
  check("quick signup: only people joining a team by invite are exempt (checkbox hidden, nothing recorded)", /\{!inviteNext && <TermsAgreement/.test(quick) && /if \(!inviteNext\) \{[\s\S]*?record_terms_acceptance/.test(quick) && /\(!inviteNext && !agreed\)/.test(quick));
  check("email signup: records the agreement before it provisions the business", recordAt(portal) > 0 && provisionAt(portal) > 0 && recordAt(portal) < provisionAt(portal));
  check("email signup: records the current TERMS_VERSION", /p_terms_version: TERMS_VERSION/.test(portal));
  check("quick signup: records and remembers the agreement before moving on", at(quick, "rememberAgreement(\"signup\")") > 0 && recordAt(quick) > 0 && recordAt(quick) < at(quick, "router.push(inviteNext ?? \"/portal/signup/business-name\")"));
  check("business-name step: records the agreement before it provisions the business", recordAt(businessName) > 0 && provisionAt(businessName) > 0 && recordAt(businessName) < provisionAt(businessName));
  check("business-name step: asks for the tick unless one was remembered", /readRememberedAgreement\(\)/.test(businessName) && /!remembered && !agreed/.test(businessName) && /<TermsAgreement/.test(businessName));
  check("business-name step: the submit button needs an agreement", /disabled=\{submitting \|\| \(!alreadyAgreed && !agreed\)\}/.test(businessName));
  check("the signup screens turn TERMS_NOT_ACCEPTED into a clear message", [portal, businessName].every((s) => s.includes('"TERMS_NOT_ACCEPTED"')));

  // ---- no client path provisions a business without recording an agreement first ----
  const clientFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) clientFiles.push(full);
    }
  };
  walk("app");
  const callers = clientFiles.filter((f) => provisionAt(read(f)) >= 0);
  check("only the two known signup screens call provision_new_business (the Google callback just routes new users to the business-name step)", callers.length === 2 && callers.every((f) => ["app/portal/signup/page.tsx", "app/portal/signup/business-name/page.tsx"].includes(f)), callers.join(", "));
  for (const file of callers) {
    const source = read(file);
    check(`${file}: record_terms_acceptance comes before provision_new_business`, recordAt(source) > -1 && recordAt(source) < provisionAt(source));
  }

  // ---- the documents themselves ----
  const terms = read("app/terms/page.tsx");
  const sectionRefs = [...terms.matchAll(/see Section (\d+)/g)].map((m) => Number(m[1]));
  const sectionTitle = (n: number) => (terms.match(new RegExp(`<h2[^>]*>${n}\\. ([^<]*)</h2>`)) ?? [])[1] ?? "";
  check("every 'see Section N' in the Terms points at the section it means (fees refs point at Subscriptions, Fees & Renewals)", sectionRefs.length > 0 && sectionRefs.every((n) => /Subscriptions, Fees/.test(sectionTitle(n))), sectionRefs.map((n) => `${n}: ${sectionTitle(n)}`).join("; "));
  check("the Terms have an Ownership & Authority section", /Ownership &amp; Authority/.test(terms));
  check("that section covers the business, websites, WhatsApp numbers and email addresses", /own the business you register/.test(terms) && /website, domain, WhatsApp number and email address/.test(terms));
  check("the Terms say a record of the agreement is kept", /keep a record of your agreement/.test(terms));
  check("the Terms show which version people are agreeing to", /\{TERMS_VERSION\}/.test(terms));
  const headings = [...terms.matchAll(/<h2[^>]*>(\d+)\./g)].map((m) => Number(m[1]));
  check("the Terms' sections are numbered 1 to N with no gap or repeat", headings.length >= 9 && headings.every((n, i) => n === i + 1), headings.join(","));
  const privacy = read("app/privacy/page.tsx");
  check("the Privacy Policy discloses the agreement record, including IP address and browser", /Agreement Records/.test(privacy) && /IP address and browser/.test(privacy));

  // ---- enforcement migration ----
  const enforce = read("supabase/migrations/0077_require_terms_acceptance.sql");
  check("the enforcement migration refuses with TERMS_NOT_ACCEPTED and ties the agreement to the business", /TERMS_NOT_ACCEPTED/.test(enforce) && /update terms_acceptances/.test(enforce));
  check("the enforcement migration warns it must be applied only after the new site is live", /ONLY AFTER/.test(enforce));
}

main().catch((error) => {
  console.error("FAIL — legal tests crashed:", error);
  process.exitCode = 1;
});
