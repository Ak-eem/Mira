import { createHmac } from "node:crypto";
import { verifyShiipSignature, mapShiipStatus, parseShiipWebhookPayload } from "./shiipWebhook";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

function run() {
  const secret = "a-real-per-business-shiip-secret";
  const body = JSON.stringify({ shipment: { data: { reference: "72d4iejm4lg0", status: "Delivered" }, carrier: "DHL" } });
  const validSignature = createHmac("sha256", secret).update(body).digest("hex");

  check(verifyShiipSignature(body, validSignature, secret) === true, "a correctly computed HMAC-SHA256 signature verifies");
  check(verifyShiipSignature(body, "wrong-signature-entirely", secret) === false, "a wrong signature is rejected");
  check(verifyShiipSignature(body, null, secret) === false, "a missing signature header is rejected, not treated as valid");
  check(verifyShiipSignature(body, validSignature, "the-wrong-businesss-secret") === false, "a signature valid for a DIFFERENT business's secret is rejected (the whole point of per-business secrets)");

  const tamperedBody = body.replace("Delivered", "Cancelled");
  check(verifyShiipSignature(tamperedBody, validSignature, secret) === false, "a tampered body (signature unchanged) is rejected");

  // Real payload shape from Shiip's own docs.
  const realExample = {
    shipment: {
      data: {
        destination: "David Ola Ojeniyi St, Ibadan, Nigeria",
        origin: "1 Kayode Otitoju St, Lekki Phase I 106104, Lekki, Nigeria",
        reference: "5lqijs7rm9n0",
        id: "565",
        status: "Delivered",
        extra: "pending,In progress,picked up,delivered.",
      },
      carrier: "DHL",
    },
  };
  const parsed = parseShiipWebhookPayload(realExample);
  check(parsed !== null && parsed.shipment.data.reference === "5lqijs7rm9n0", "parses Shiip's real documented payload shape correctly");

  check(parseShiipWebhookPayload({}) === null, "an empty object is rejected, not partially trusted");
  check(parseShiipWebhookPayload(null) === null, "null body is rejected");
  check(parseShiipWebhookPayload({ shipment: {} }) === null, "a shipment object missing data is rejected");
  check(parseShiipWebhookPayload({ shipment: { data: { status: "Delivered" } } }) === null, "a payload missing reference is rejected (reference is the join key -- without it there's nothing to match against)");

  check(mapShiipStatus("Delivered") === "delivered", "maps Delivered (capitalized, as Shiip sends it) correctly");
  check(mapShiipStatus("picked up") === "picked_up", "maps 'picked up' to picked_up");
  check(mapShiipStatus("In Progress") === "booked", "maps In Progress to booked");
  check(mapShiipStatus("Pending") === "booked", "maps Pending to booked");
  check(mapShiipStatus("some future status Shiip adds later") === null, "an unrecognized status returns null rather than guessing a mapping");
}

run();
