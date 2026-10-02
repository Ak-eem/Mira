import { hasAutomatedHeaders, isAutomatedSenderAddress } from "./autoReply";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

check(isAutomatedSenderAddress("MAILER-DAEMON@mail.example.com"), "mailer-daemon sender is automated");
check(isAutomatedSenderAddress("No Reply <no-reply@shop.com>"), "no-reply in display-name form is automated");
check(isAutomatedSenderAddress("noreply+abc@shop.com"), "noreply+tag is automated");
check(isAutomatedSenderAddress("mira@miraapp.com.ng", ["Mira@MiraApp.com.ng"]), "our own address is treated as automated (self-loop)");
check(!isAutomatedSenderAddress("ada@customer.com"), "a normal customer is not automated");
check(!isAutomatedSenderAddress("notify-me@customer.com"), "a normal address that merely starts with 'notif' is not automated");

check(hasAutomatedHeaders({ "Auto-Submitted": "auto-replied" }), "Auto-Submitted: auto-replied is automated");
check(!hasAutomatedHeaders({ "Auto-Submitted": "no" }), "Auto-Submitted: no is not automated");
check(hasAutomatedHeaders({ precedence: "bulk" }), "Precedence: bulk is automated");
check(hasAutomatedHeaders({ "List-Id": "<news.example.com>" }), "List-Id marks a mailing list");
check(!hasAutomatedHeaders({ Subject: "hi" }), "ordinary headers are not automated");
check(!hasAutomatedHeaders(null), "null headers are not automated");
