// Where an approved website-import suggestion would be written, so the server can refuse to add something the
// business already has (importing twice used to create "Delivery" twice).

export function duplicateTarget(kind: string, payload: Record<string, unknown>): { table: string; column: string; value: string } | null {
  const pick = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string).trim() : "");
  const map: Record<string, { table: string; column: string; key: string }> = {
    product: { table: "products", column: "name", key: "name" },
    service: { table: "services", column: "name", key: "name" },
    faq: { table: "faqs", column: "question", key: "question" },
    policy: { table: "policies", column: "title", key: "title" },
  };
  const target = map[kind];
  const value = target ? pick(target.key) : "";
  return target && value ? { table: target.table, column: target.column, value } : null;
}

/** Escapes % and _ so the value is matched literally by ilike. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
