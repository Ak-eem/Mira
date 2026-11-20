// The agreement every new account must accept before Mira creates its business: that the person owns the business
// (or is authorised to act for it) and owns or may manage every website, WhatsApp number and email address they
// connect. The same words are shown on every signup path and are stored, verbatim, with the acceptance record
// (supabase/migrations/0075_terms_acceptance.sql keeps the text for each version, and legal.test.ts fails if the
// two ever differ). When the wording or the Terms change, add a NEW version in a migration; never edit an old one.

export const TERMS_VERSION = "2026-11-08";

export const OWNERSHIP_STATEMENT =
  "I confirm that I own this business, or I am legally authorised to act for it, and that I own, or have permission to manage, every website, WhatsApp number and email address I connect to Mira.";

// What is stored with the acceptance (the checkbox shows the same sentence with links on the two document names).
export const AGREEMENT_FULL_TEXT = `${OWNERSHIP_STATEMENT} I agree to the Terms of Service and Privacy Policy.`;

// Where in the app the person agreed. Stored with the record; a short fixed list so it stays meaningful.
export type AgreementSource = "portal_signup" | "signup" | "google_signup" | "business_name";

// A person who ticks the box on a signup page and then goes through Google (or a page redirect) leaves our page
// before the account exists. The tick is remembered in this browser so the next step can record it instead of
// asking again. It is only a convenience: the database record is what counts, and without it no business is created.
const STORAGE_KEY = "mira.terms.agreed";

type Remembered = { version: string; source: AgreementSource };

export function rememberAgreement(source: AgreementSource): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: TERMS_VERSION, source } satisfies Remembered));
  } catch {
    // Private mode or storage blocked: the next step simply asks again.
  }
}

export function readRememberedAgreement(): Remembered | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Remembered>;
    // An agreement to an older version does not count towards the current one.
    if (value.version !== TERMS_VERSION || typeof value.source !== "string") return null;
    return { version: value.version, source: value.source as AgreementSource };
  } catch {
    return null;
  }
}

export function forgetAgreement(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const AGREEMENT_REQUIRED_MESSAGE = "Tick the box to confirm you own this business and agree to the Terms before continuing.";
