# What running Mira actually costs

Figures marked (code) come from this repository's defaults; everything else is a third party's price and changes, so check the linked source before quoting it to a customer.

## What the business pays you

- **Mira subscription:** 50,000 NGN per month. The first 10 businesses that ever subscribe get a promo price of 25,000 NGN. (code: `PAYSTACK_BASE_AMOUNT_NGN`, `PAYSTACK_BASE_PROMO_AMOUNT_NGN`)
- **Payment fee (Paystack):** 1.5% plus 100 NGN per transaction; the 100 NGN is waived under 2,500 NGN and fees are capped at 2,000 NGN. Confirm current terms with Paystack.

## What you pay to run it (not included above)

| Item | Notes |
|---|---|
| Supabase | Free tier to start; paid plans add backups and more capacity. |
| Vercel | The free Hobby plan is for non-commercial use, so a paid product needs a paid plan. |
| AI (Groq / Gemini) | Pay per use. Cost grows with the number and length of conversations. |
| Email (Resend) | Free tier, then per email. |
| **WhatsApp (Meta)** | **Per message, and the rules changed on 1 October 2026.** Until then, free-form replies sent within 24 hours of a customer's message were free. Since 1 October 2026 Meta bills those "service messages" per message (reports mention a free monthly allowance and a Nigeria rate of roughly one US cent; verify on Meta's pricing page). Every AI reply on WhatsApp is a service message, so WhatsApp cost now scales with how much customers chat. |

## What this means for pricing

Work out, per business, the expected WhatsApp messages per month times Meta's current per-message rate for Nigeria, plus AI cost per conversation, and check the subscription covers both with margin. Do this before offering the promo price to more businesses. Meta's pricing: https://developers.facebook.com/docs/whatsapp/pricing
