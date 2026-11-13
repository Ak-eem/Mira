import { closeConversation } from "./closeConversation";

const calls: string[] = [];
const query = {
  update(values: Record<string, unknown>) {
    calls.push(`update:${Object.keys(values).sort().join(",")}`);
    return this;
  },
  eq(column: string, value: string) {
    calls.push(`eq:${column}:${value}`);
    return this;
  },
  or(filters: string) {
    calls.push(`or:${filters}`);
    return this;
  },
  select(columns: string) {
    calls.push(`select:${columns}`);
    return this;
  },
  async maybeSingle() {
    return { data: null, error: null };
  },
};
const supabase = {
  from(table: string) {
    calls.push(`from:${table}`);
    return query;
  },
} as never;

async function main() {
  const result = await closeConversation(supabase, {
    conversationId: "conversation-1",
    businessId: "business-1",
    endedBy: "customer",
    preserveSupportHandoff: true,
  });

  const handoffGuard = "or:needs_human.eq.false,handoff_reason.eq.order";
  if (!calls.includes(handoffGuard)) {
    console.error("FAIL: delivery close must leave support handoffs open");
    process.exitCode = 1;
  } else {
    console.log("PASS: delivery close conditionally preserves support handoffs");
  }
  if (result.closed || result.error) {
    console.error("FAIL: a filtered-out conversation should not be reported as closed");
    process.exitCode = 1;
  }
}

void main();
