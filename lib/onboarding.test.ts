import { normalizeAnswers, isConnectableCourier, COURIER_OPTIONS } from "./onboarding";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

function run() {
  const full = normalizeAnswers({ wantsEmailChannel: true, tracksInventory: false, logisticsProvider: "shiip" });
  check(full.ok && full.answers.wantsEmailChannel === true && full.answers.tracksInventory === false && full.answers.logisticsProvider === "shiip", "valid answers pass through unchanged");

  const skipped = normalizeAnswers({});
  check(skipped.ok && skipped.answers.wantsEmailChannel === null && skipped.answers.tracksInventory === null && skipped.answers.logisticsProvider === null, "an empty object is a skip: every answer null");
  const explicitNull = normalizeAnswers({ wantsEmailChannel: null, tracksInventory: null, logisticsProvider: null });
  check(explicitNull.ok && explicitNull.answers.logisticsProvider === null, "explicit nulls are a skip too");

  check(normalizeAnswers({ wantsEmailChannel: false }).ok === true, "false is an answer, not 'missing' (it must not collapse to null)");
  const f = normalizeAnswers({ wantsEmailChannel: false, tracksInventory: false });
  check(f.ok && f.answers.wantsEmailChannel === false && f.answers.tracksInventory === false, "'No' stays false rather than becoming null");

  check(!normalizeAnswers({ wantsEmailChannel: "yes" }).ok, "a string where a boolean belongs is rejected, not coerced");
  check(!normalizeAnswers({ tracksInventory: 1 }).ok, "a number where a boolean belongs is rejected");
  check(!normalizeAnswers({ logisticsProvider: "'; drop table businesses;--" }).ok, "an arbitrary courier string is rejected (can't write free text into the table)");
  check(!normalizeAnswers({ logisticsProvider: "SHIIP" }).ok, "courier ids are exact: wrong case is rejected, not guessed at");
  check(!normalizeAnswers({ logisticsProvider: 7 }).ok, "a non-string courier is rejected");
  check(!normalizeAnswers(null).ok && !normalizeAnswers("x").ok && !normalizeAnswers([1]).ok && !normalizeAnswers(undefined).ok, "null, string, array and undefined bodies are all rejected");

  for (const option of COURIER_OPTIONS) {
    const r = normalizeAnswers({ logisticsProvider: option.id });
    if (!r.ok) check(false, `every listed courier is accepted: ${option.id}`);
  }
  check(true, "every courier in the list is accepted");
  check(new Set(COURIER_OPTIONS.map((o) => o.id)).size === COURIER_OPTIONS.length, "courier ids are unique");

  check(isConnectableCourier("shiip") === true, "Shiip is connectable");
  check(COURIER_OPTIONS.filter((o) => o.connectable).map((o) => o.id).join() === "shiip", "Shiip is the ONLY connectable courier (the wizard must not imply others work)");
  check(isConnectableCourier("gig") === false && isConnectableCourier("self") === false && isConnectableCourier(null) === false && isConnectableCourier("nope") === false, "non-connectable, self, null and unknown are not connectable");
}

run();
