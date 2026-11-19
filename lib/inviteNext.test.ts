import { safeInvitePath } from "./inviteNext";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

const token = "a".repeat(64);
check(safeInvitePath(`/invite/${token}`) === `/invite/${token}`, "a normal invite path is accepted");
check(safeInvitePath("/portal") === null, "other pages are rejected");
check(safeInvitePath("//evil.com/invite/abcdefgh") === null, "protocol-relative URLs are rejected");
check(safeInvitePath("https://evil.com/invite/abcdefgh") === null, "absolute URLs are rejected");
check(safeInvitePath(`/invite/${token}?x=1`) === null, "extra query strings are rejected");
check(safeInvitePath(`/invite/${token}/../../admin`) === null, "path tricks are rejected");
check(safeInvitePath("/invite/") === null && safeInvitePath("/invite/short") === null, "empty or too-short tokens are rejected");
check(safeInvitePath(null) === null && safeInvitePath(["/invite/abcdefgh"]) === null, "non-strings are rejected");
