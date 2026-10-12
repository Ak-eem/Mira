// The legal operator of Mira, shown on every public page and on /contact. These exact strings are what Meta
// business verification checks against the registration documents: do not abbreviate or reword them.
export const BUSINESS_LEGAL_NAME = "ICE MANAGERIAL COOLING ENTERPRISE";
export const BUSINESS_ADDRESS = "384, Herbert Macaulay Road, Yaba, Lagos, Nigeria";

// A monitored inbox. Set NEXT_PUBLIC_CONTACT_EMAIL to change it; the default is the support address Mira
// already puts in its customer emails.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "mirasupport03@gmail.com";
