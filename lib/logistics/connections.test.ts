import { randomBytes } from "node:crypto";
import { Module } from "node:module";

type ModuleLoader = (request: string, ...rest: unknown[]) => unknown;
const originalLoad = (Module as unknown as { _load: ModuleLoader })._load;
(Module as unknown as { _load: ModuleLoader })._load = function patchedLoad(request, ...rest) {
  if (request === "server-only") return {};
  return originalLoad.call(Module, request, ...rest);
};

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

type Row = Record<string, unknown>;

// Small in-memory stand-in for the three tables these functions touch.
// Filters are applied for real (eq chains), so a missing business_id
// scope in the code under test shows up as a wrong result here rather
// than being papered over.
function fakeDb(seed: { accounts?: Row[]; orders?: Row[]; shipments?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    business_logistics_accounts: seed.accounts ?? [],
    orders: seed.orders ?? [],
    order_shipments: seed.shipments ?? [],
  };
  let nextId = 1;
  const failInsertWith: { code?: string } = {};

  function query(table: string) {
    const filters: [string, unknown][] = [];
    let mode: "select" | "update" = "select";
    let patch: Row = {};
    const matches = () => tables[table].filter((r) => filters.every(([k, v]) => r[k] === v));
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return builder;
      },
      maybeSingle: () => Promise.resolve({ data: matches()[0] ?? null, error: null }),
      update: (p: Row) => {
        mode = "update";
        patch = p;
        return builder;
      },
      then: (resolve: (v: unknown) => void) => {
        if (mode === "update") for (const r of matches()) Object.assign(r, patch);
        resolve({ error: null });
      },
      insert: (row: Row) => {
        if (failInsertWith.code) return Promise.resolve({ error: { code: failInsertWith.code, message: "x" } });
        if (table === "order_shipments") {
          const dup = tables[table].some(
            (r) => r.business_id === row.business_id && r.provider === row.provider && r.courier_reference === row.courier_reference,
          );
          if (dup) return Promise.resolve({ error: { code: "23505", message: "dup" } });
        }
        tables[table].push({ id: `id${nextId++}`, status: "active", ...row });
        return Promise.resolve({ error: null });
      },
    };
    return builder;
  }
  return { client: { from: (t: string) => query(t) } as never, tables, failInsertWith };
}

async function run() {
  process.env.LOGISTICS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
  const { saveConnection, disconnect, linkShipmentToOrder } = await import("./connections");
  const { decryptCredential } = await import("./credentials");

  const A = "aaaaaaaa-0000-0000-0000-000000000001";
  const B = "aaaaaaaa-0000-0000-0000-000000000002";

  // --- saveConnection ---
  {
    const { client, tables } = fakeDb();
    const r = await saveConnection(client, { businessId: A, provider: "shiip", webhookSecret: "whsec_PLAINTEXT" });
    check(r.ok === true, "saves a new connection");
    const row = tables.business_logistics_accounts[0];
    check(!JSON.stringify(row).includes("whsec_PLAINTEXT"), "the plaintext webhook secret never reaches the stored row");
    check(decryptCredential(row.encrypted_webhook_secret as string) === "whsec_PLAINTEXT", "the stored webhook secret decrypts back to the original");
    check(row.encrypted_credentials === undefined, "no API credential is stored at all: nothing in Mira uses one, so none is collected");
  }
  {
    const { client, tables } = fakeDb();
    await saveConnection(client, { businessId: A, provider: "shiip", webhookSecret: "s1" });
    const first = tables.business_logistics_accounts[0].encrypted_webhook_secret;
    const r = await saveConnection(client, { businessId: A, provider: "shiip", webhookSecret: "s2" });
    check(r.ok === true && tables.business_logistics_accounts.length === 1, "saving again updates the existing active connection in place, not a second row");
    check(tables.business_logistics_accounts[0].encrypted_webhook_secret !== first, "the in-place update actually replaced the secret");
    check(decryptCredential(tables.business_logistics_accounts[0].encrypted_webhook_secret as string) === "s2", "and the new value is the one stored");
  }
  {
    const { client } = fakeDb();
    check((await saveConnection(client, { businessId: A, provider: "dhl", webhookSecret: "s" })).ok === false, "an unsupported courier is rejected");
    check((await saveConnection(client, { businessId: A, provider: "shiip", webhookSecret: "" })).ok === false, "a blank webhook secret is rejected");
    check((await saveConnection(client, { businessId: A, provider: "shiip", webhookSecret: "   " })).ok === false, "a whitespace-only webhook secret is rejected");
    check((await saveConnection(client, { businessId: A, provider: "shiip", webhookSecret: 123 })).ok === false, "a non-string secret from a crafted call is rejected");
    check((await saveConnection(client, { businessId: A, provider: "shiip", webhookSecret: "x".repeat(600) })).ok === false, "an oversized value is rejected");
  }
  {
    const saved = process.env.LOGISTICS_CREDENTIALS_KEY;
    delete process.env.LOGISTICS_CREDENTIALS_KEY;
    const { client, tables } = fakeDb();
    const origError = console.error;
    console.error = () => {};
    const r = await saveConnection(client, { businessId: A, provider: "shiip", webhookSecret: "s" });
    console.error = origError;
    check(r.ok === false && tables.business_logistics_accounts.length === 0, "with no encryption key configured, nothing is written (never falls back to storing plaintext)");
    check(r.ok === false && !/KEY|env/i.test(r.error), "the owner-facing error doesn't leak the internal reason");
    process.env.LOGISTICS_CREDENTIALS_KEY = saved;
  }

  // --- disconnect ---
  {
    const { client, tables } = fakeDb({
      accounts: [
        { id: "a1", business_id: A, provider: "shiip", status: "active" },
        { id: "b1", business_id: B, provider: "shiip", status: "active" },
      ],
    });
    await disconnect(client, { businessId: A, provider: "shiip" });
    check(tables.business_logistics_accounts.find((r) => r.id === "a1")?.status === "disconnected", "disconnect marks the business's own connection disconnected");
    check(tables.business_logistics_accounts.find((r) => r.id === "b1")?.status === "active", "disconnecting business A leaves business B's connection untouched");
  }

  // --- linkShipmentToOrder ---
  const seeded = () =>
    fakeDb({
      accounts: [
        { id: "acctA", business_id: A, provider: "shiip", status: "active" },
        { id: "acctB", business_id: B, provider: "shiip", status: "active" },
      ],
      orders: [
        { id: "orderA", business_id: A },
        { id: "orderB", business_id: B },
      ],
    });
  {
    const { client, tables } = seeded();
    const r = await linkShipmentToOrder(client, { businessId: A, orderId: "orderA", provider: "shiip", reference: "72d4iejm4lg0" });
    check(r.ok === true, "links an order to a courier reference");
    const row = tables.order_shipments[0];
    check(row.business_id === A && row.order_id === "orderA" && row.courier_reference === "72d4iejm4lg0" && row.logistics_account_id === "acctA", "the shipment row carries the right business, order, reference and that business's own connection");
  }
  {
    const { client, tables } = seeded();
    const r = await linkShipmentToOrder(client, { businessId: A, orderId: "orderB", provider: "shiip", reference: "72d4iejm4lg0" });
    check(r.ok === false && tables.order_shipments.length === 0, "business A cannot link business B's order, even with B's real order id");
  }
  {
    const { client } = fakeDb({ accounts: [], orders: [{ id: "orderA", business_id: A }] });
    const r = await linkShipmentToOrder(client, { businessId: A, orderId: "orderA", provider: "shiip", reference: "72d4iejm4lg0" });
    check(r.ok === false && /connect/i.test(r.error), "linking without a connected courier tells the owner to connect first");
  }
  {
    const { client } = seeded();
    await linkShipmentToOrder(client, { businessId: A, orderId: "orderA", provider: "shiip", reference: "SAME-REF-1" });
    const dup = await linkShipmentToOrder(client, { businessId: A, orderId: "orderA", provider: "shiip", reference: "SAME-REF-1" });
    check(dup.ok === false && /already linked/i.test(dup.error), "the same reference linked twice in one business is rejected with a clear message");
    const other = await linkShipmentToOrder(client, { businessId: B, orderId: "orderB", provider: "shiip", reference: "SAME-REF-1" });
    check(other.ok === true, "the same reference string in a DIFFERENT business is allowed (isolation is per business)");
  }
  {
    const { client } = seeded();
    for (const bad of ["", "  ", "ab", "has space inside", "semi;colon", "x".repeat(65), 42, null]) {
      const r = await linkShipmentToOrder(client, { businessId: A, orderId: "orderA", provider: "shiip", reference: bad });
      if (r.ok) check(false, `rejects a malformed reference: ${JSON.stringify(bad)}`);
    }
    check(true, "malformed references (blank, too short/long, spaces, punctuation, non-strings) are all rejected");
  }
}

void run();
