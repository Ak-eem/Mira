import { webcrypto } from "node:crypto";
import { parseVisitorId, uuidV4FromRandomValues } from "./visitor";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

check(parseVisitorId("3f2b8c1e-9a4d-4e7b-8d21-5c6a7b9e0f12") !== null, "a UUID is accepted");
check(parseVisitorId("  3f2b8c1e-9a4d-4e7b-8d21-5c6a7b9e0f12  ") === "3f2b8c1e-9a4d-4e7b-8d21-5c6a7b9e0f12", "whitespace is trimmed");
check(parseVisitorId("1759367123456-k3j9x8a2b1c") !== null, "a legacy timestamp-random id is still accepted");
check(parseVisitorId("1759367123456-i") !== null, "a legacy id with a very short random part is still accepted");
check(parseVisitorId("1") === null, "a short guessable id is rejected");
check(parseVisitorId("admin") === null, "a dictionary word is rejected");
check(parseVisitorId("x".repeat(129)) === null, "an oversized id is rejected");
check(parseVisitorId("3f2b8c1e-9a4d-4e7b-8d21-5c6a7b9e0f12/../x") === null, "path characters are rejected");
check(parseVisitorId(undefined) === null && parseVisitorId(42) === null, "non-strings are rejected");

// The widget's no-randomUUID fallback must produce an id the server accepts.
for (let i = 0; i < 200; i++) {
  const id = uuidV4FromRandomValues((bytes) => webcrypto.getRandomValues(bytes));
  if (parseVisitorId(id) !== id || id[14] !== "4" || !"89ab".includes(id[19])) {
    check(false, `fallback id ${id} is a valid v4 UUID the server accepts`);
    break;
  }
  if (i === 199) check(true, "200 fallback ids are valid v4 UUIDs that the server accepts");
}
