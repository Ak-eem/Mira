import { buildWhatsappItem, buildEmailArgs } from "./rowPayload";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }

const wa = buildWhatsappItem({ message_id: "wamid.1", waba_phone_number_id: "555", payload: { id: "wamid.1", from: "2348012345678", text: { body: "hi" } } });
check("whatsapp row rebuilds the handler's item", wa?.id === "wamid.1" && wa.from === "2348012345678" && wa.text === "hi" && wa.phoneId === "555");
check("whatsapp non-text message keeps an empty text", buildWhatsappItem({ message_id: "m", waba_phone_number_id: "5", payload: { from: "234" } })?.text === "");
check("whatsapp row without a sender is rejected", buildWhatsappItem({ message_id: "m", waba_phone_number_id: "5", payload: { text: { body: "x" } } }) === null);
check("whatsapp row with a non-object payload is rejected", buildWhatsappItem({ message_id: "m", waba_phone_number_id: "5", payload: "oops" }) === null);
check("whatsapp row without a phone id is rejected", buildWhatsappItem({ message_id: "m", waba_phone_number_id: "", payload: { from: "234" } }) === null);

const em = buildEmailArgs({ resend_email_id: "e1", to_address: " Support@Biz.test ", payload: { type: "email.received", data: { from: " Jane@Mail.test ", subject: "Hello", message_id: "<abc@mail>" } } });
check("email row rebuilds sender (lower-cased), address and subject", em?.sender === "jane@mail.test" && em.toAddress === "support@biz.test" && em.subject === "Hello" && em.emailId === "e1" && em.messageId === "<abc@mail>");
check("email row without data is rejected", buildEmailArgs({ resend_email_id: "e1", to_address: "a@b.c", payload: { type: "x" } }) === null);
check("email row without a sender is rejected", buildEmailArgs({ resend_email_id: "e1", to_address: "a@b.c", payload: { data: { subject: "s" } } }) === null);
check("email row with a missing subject falls back to empty", buildEmailArgs({ resend_email_id: "e1", to_address: "a@b.c", payload: { data: { from: "x@y.z" } } })?.subject === "");
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
