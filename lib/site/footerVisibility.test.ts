import { shouldShowFooter } from "./footerVisibility";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }

for (const path of ["/", "/contact", "/terms", "/privacy", "/login", "/signup", "/subscribe", "/invite/abc", "/chatty-page"]) check(`shown on ${path}`, shouldShowFooter(path));
for (const path of ["/chat/some-shop", "/chat/some-shop/anything", "/admin", "/admin/analytics", "/portal", "/portal/123/orders"]) check(`hidden on ${path}`, !shouldShowFooter(path));
check("shown when the path is unknown", shouldShowFooter(null) && shouldShowFooter(undefined));
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
