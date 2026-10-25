import { customerLabel } from "./customerLabel";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }
check("a web session is a website visitor, not the raw id", customerLabel("web_c97c1a2b3d4e") === "Website visitor");
check("a WhatsApp session shows the number", customerLabel("wa_2348012345678") === "+2348012345678");
check("an email session shows the address", customerLabel("email_ada@shop.test") === "ada@shop.test");
check("missing or unknown tokens are website visitors", customerLabel(null) === "Website visitor" && customerLabel(undefined) === "Website visitor" && customerLabel("zzz") === "Website visitor");
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
