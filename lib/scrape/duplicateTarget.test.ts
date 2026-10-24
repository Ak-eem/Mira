import { duplicateTarget, escapeLike } from "./duplicateTarget";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }
check("a service is checked against the services table by name", JSON.stringify(duplicateTarget("service", { name: " Delivery " })) === JSON.stringify({ table: "services", column: "name", value: "Delivery" }));
check("a product is checked by name", duplicateTarget("product", { name: "Kaftan" })?.table === "products");
check("a FAQ is checked by question and a policy by title", duplicateTarget("faq", { question: "Q?" })?.column === "question" && duplicateTarget("policy", { title: "T" })?.column === "title");
check("hours, images and nameless items have no duplicate check", duplicateTarget("business_hours", { name: "x" }) === null && duplicateTarget("image", { url: "u" }) === null && duplicateTarget("product", {}) === null);
check("like wildcards are escaped", escapeLike("50%_off") === "50\\%\\_off");
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
