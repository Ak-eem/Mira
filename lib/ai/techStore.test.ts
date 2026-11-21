import { looksLikeTechResearchQuestion, researchTech, TECH_STORE_GUIDANCE } from "./techStore";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

async function run() {
  check(looksLikeTechResearchQuestion("Does the iPhone 15 Pro support eSIM and how is the battery life?"), "spec question triggers research");
  check(looksLikeTechResearchQuestion("What is the difference between S24 and S24 Ultra"), "comparison triggers research");
  check(!looksLikeTechResearchQuestion("hello"), "greeting does not");
  check(!looksLikeTechResearchQuestion("I want to order two chargers please send details"), "order talk does not");
  check(!looksLikeTechResearchQuestion("x".repeat(500) + " specs"), "very long message does not");
  check(/Never invent specifications/.test(TECH_STORE_GUIDANCE) && /ONLY from this business/.test(TECH_STORE_GUIDANCE), "guidance keeps price and stock to the store's own list");

  check((await researchTech("iphone 15 specs", { apiKey: "" })) === null, "no key means no lookup");

  let calls = 0;
  const ok = async () => {
    calls += 1;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "- 6.1 inch OLED\n- A16 chip" }] } }] }), { status: 200 });
  };
  const clock = 1_000_000;
  const first = await researchTech("Galaxy S24 specs", { apiKey: "k", fetchFn: ok as unknown as typeof fetch, now: () => clock });
  const second = await researchTech("  galaxy   s24 SPECS ", { apiKey: "k", fetchFn: ok as unknown as typeof fetch, now: () => clock + 1000 });
  check(first?.includes("A16") === true && second === first && calls === 1, "result is returned and cached across spelling of the same question");

  const bad = async () => new Response("nope", { status: 500 });
  check((await researchTech("pixel 9 specs", { apiKey: "k", fetchFn: bad as unknown as typeof fetch })) === null, "provider error is silent");
  const none = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "NO_RESULTS" }] } }] }), { status: 200 });
  check((await researchTech("zzz unknown gadget specs", { apiKey: "k", fetchFn: none as unknown as typeof fetch })) === null, "NO_RESULTS becomes nothing");
  const boom = async () => { throw new Error("network"); };
  check((await researchTech("tecno camon 30 specs", { apiKey: "k", fetchFn: boom as unknown as typeof fetch })) === null, "network failure is silent");
}
run();
