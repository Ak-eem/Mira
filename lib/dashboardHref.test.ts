import { dashboardHref } from "./dashboardHref";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }
check("admin, no business: platform dashboard", dashboardHref("admin") === "/admin" && dashboardHref("admin", null) === "/admin" && dashboardHref("admin", undefined) === "/admin");
check("admin inside a business: that business's dashboard", dashboardHref("admin", "abc-123") === "/admin/businesses/abc-123");
check("portal, no business: portal home", dashboardHref("portal") === "/portal");
check("portal inside a business: that business's dashboard", dashboardHref("portal", "abc-123") === "/portal/abc-123");
check("an array param (catch-all route) uses its first value", dashboardHref("portal", ["abc-123", "x"]) === "/portal/abc-123");
check("an empty id falls back to the area home", dashboardHref("admin", "") === "/admin" && dashboardHref("portal", "") === "/portal");
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
