import { describeError } from "./errorInfo";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }

check("RLS/permission code maps to a plain explanation", describeError({ message: "permission denied for table x", code: "42501" }).hint.includes("platform admin"));
check("missing table code points at migrations", describeError({ message: "relation \"x\" does not exist", code: "42P01" }).hint.includes("migration"));
check("missing table without a code is still recognised from the message", describeError({ message: "relation \"public.x\" does not exist" }).hint.includes("migration"));
check("network failures are recognised", describeError(new Error("TypeError: fetch failed")).hint.includes("could not be reached"));
check("expired JWT is recognised", describeError({ message: "JWT expired" }).hint.includes("expired"));
check("an Error instance keeps its message", describeError(new Error("boom")).message === "boom");
check("a bare string is accepted", describeError("oops").message === "oops");
check("null/undefined do not throw", describeError(null).message === "Unknown error" && describeError(undefined).message === "Unknown error");
check("the database's own hint is used when we have no better one", describeError({ message: "x", code: "99999", hint: "Perhaps you meant y." }).hint === "Perhaps you meant y.");
check("code and details are passed through", (() => { const e = describeError({ message: "m", code: "23505", details: "Key (id)=(1) already exists." }); return e.code === "23505" && e.details?.includes("Key") === true; })());
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
