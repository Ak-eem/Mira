process.env.WHATSAPP_TOKEN = "test-token";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

const realFetch = globalThis.fetch;
function stubFetch(impl: () => Promise<Response>) {
  globalThis.fetch = (() => impl()) as typeof fetch;
}

async function run() {
  const { sendWhatsappReplyDetailed, sendWhatsappReply } = await import("./sendMessage");
  const queue = await import("./inboundQueue");

  stubFetch(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.ABC" }] }), { status: 200 }));
  const ok = await sendWhatsappReplyDetailed("p", "234", "hi");
  check(ok.outcome === "sent" && ok.messageId === "wamid.ABC", "2xx is 'sent' and captures Meta's message id");

  stubFetch(async () => new Response("not json", { status: 200 }));
  const noBody = await sendWhatsappReplyDetailed("p", "234", "hi");
  check(noBody.outcome === "sent" && noBody.messageId === null, "2xx with an unreadable body is still 'sent'");

  stubFetch(async () => new Response("{}", { status: 400 }));
  check((await sendWhatsappReplyDetailed("p", "234", "hi")).outcome === "rejected", "4xx is 'rejected' (definitely not delivered)");

  stubFetch(async () => new Response("{}", { status: 503 }));
  check((await sendWhatsappReplyDetailed("p", "234", "hi")).outcome === "unknown", "5xx is 'unknown', not assumed undelivered");

  stubFetch(async () => { throw new Error("socket hang up"); });
  check((await sendWhatsappReplyDetailed("p", "234", "hi")).outcome === "unknown", "network error / timeout is 'unknown'");

  stubFetch(async () => new Response("{}", { status: 400 }));
  check((await sendWhatsappReply("p", "234", "hi")) === false, "boolean wrapper: rejected -> false");
  stubFetch(async () => new Response(JSON.stringify({ messages: [{ id: "x" }] }), { status: 200 }));
  check((await sendWhatsappReply("p", "234", "hi")) === true, "boolean wrapper: sent -> true");
  globalThis.fetch = realFetch;

  const fresh = { send_started_at: null, send_resent: false };
  const ambiguous = { send_started_at: "2026-01-01T00:00:00Z", send_resent: false };
  const spent = { send_started_at: "2026-01-01T00:00:00Z", send_resent: true };
  const a = queue.decideSend(fresh);
  check(a.action === "send" && a.resend === false, "no prior send: send normally");
  const b = queue.decideSend(ambiguous);
  check(b.action === "send" && b.resend === true, "one ambiguous prior send: re-send once, flagged as a re-send");
  check(queue.decideSend(spent).action === "abandon", "ambiguous again after the re-send: stop instead of looping");

  let calls = 0;
  const flaky = {
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve(++calls < 3 ? { error: new Error("blip") } : { error: null }),
      }),
    }),
  } as never;
  await queue.markInboundSent(flaky, "row", "wamid.ABC");
  check(calls === 3, "ack is retried through transient DB errors after a confirmed send");

  let dead = 0;
  const broken = {
    from: () => ({
      update: () => ({
        eq: () => {
          dead++;
          return Promise.resolve({ error: new Error("down") });
        },
      }),
    }),
  } as never;
  let threw = false;
  try { await queue.markInboundSent(broken, "row"); } catch { threw = true; }
  check(threw && dead === 3, "ack gives up and throws after 3 failures");
}

void run();
