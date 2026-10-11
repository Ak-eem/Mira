import { AiProviderError, errorCodeFor, errorDetailFor, explainAiError, providerFor, summarizeProviderBody } from "./providerError";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }

const http429 = new AiProviderError("The assistant is temporarily unavailable.", { provider: "groq", kind: "http", status: 429, detail: "Rate limit reached" });
check("an HTTP failure becomes http_<status>", errorCodeFor(http429) === "http_429");
check("customer-facing message is untouched", http429.message === "The assistant is temporarily unavailable.");
check("detail carries the provider's words", errorDetailFor(http429) === "Rate limit reached");
check("provider is recoverable", providerFor(http429) === "groq" && providerFor(new Error("x")) === null);
check("timeout / network / config / empty codes", errorCodeFor(new AiProviderError("m", { provider: "gemini", kind: "timeout" })) === "timeout"
  && errorCodeFor(new AiProviderError("m", { provider: "gemini", kind: "network" })) === "network"
  && errorCodeFor(new AiProviderError("m", { provider: "groq", kind: "config" })) === "not_configured"
  && errorCodeFor(new AiProviderError("m", { provider: "groq", kind: "empty" })) === "empty_response");
check("a plain Error keeps its name; detail is its message", errorCodeFor(new TypeError("boom")) === "TypeError" && errorDetailFor(new TypeError("boom")) === "boom");
check("a non-error is 'unknown' with no detail", errorCodeFor("x") === "unknown" && errorDetailFor("x") === null);
check("a provider error without detail falls back to its message", errorDetailFor(new AiProviderError("friendly", { provider: "groq", kind: "timeout" })) === "friendly");

check("JSON error body is reduced to its message", summarizeProviderBody('{"error":{"message":"Rate limit reached for model X","type":"tokens"}}') === "Rate limit reached for model X");
check("a string error field works", summarizeProviderBody('{"error":"bad key"}') === "bad key");
check("array-wrapped bodies work", summarizeProviderBody('[{"error":{"message":"quota"}}]') === "quota");
check("non-JSON text is collapsed and kept", summarizeProviderBody("  upstream\n  timeout ") === "upstream timeout");
check("empty body gives empty text", summarizeProviderBody("   ") === "");
check("long bodies are bounded", summarizeProviderBody("x".repeat(2000)).length === 500);

check("429 explained", explainAiError("http_429", "groq").title === "Groq rate limit hit");
check("401 explained as a key problem", explainAiError("http_401", "gemini").title === "Gemini rejected the API key");
check("5xx explained as an outage", explainAiError("http_503", "groq").title === "Groq had a server error");
check("legacy 'Error' rows are labelled honestly", explainAiError("Error", "groq").title === "Unknown AI error" && explainAiError(null, "groq").title === "Unknown AI error");
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
