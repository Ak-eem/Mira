import { readFileSync } from "node:fs";
import { join } from "node:path";

// Run with `npx tsx lib/chat/emailGate.test.ts`.
//
// Guards an ordering bug: in the email webhook, a business with AI email replies
// switched off goes to captureForHuman, which stores the customer's email without
// ever reaching the switched-off check inside processIncomingMessage. The check must
// therefore run first. The route is too entangled with Resend and the queue to
// run directly, so this pins the order in the source.
function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

const source = readFileSync(join(__dirname, "../../app/api/webhooks/email/route.ts"), "utf8");
const gate = source.indexOf("isBusinessSwitchedOff(client, routedBusiness.id)");
const capture = source.indexOf("captureForHuman(client, routedBusiness.id");
const aiPath = source.indexOf("processIncomingMessage(client, routedBusiness.id");

check(gate !== -1, "the email webhook checks whether the business is switched off");
check(capture !== -1 && aiPath !== -1, "both the human-inbox path and the AI path still exist");
check(gate < capture, "the switched-off check runs BEFORE the human-inbox (captureForHuman) path");
check(gate < aiPath, "the switched-off check runs before the AI reply path");
