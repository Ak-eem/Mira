/** Key under which the assistant reply to one inbound message is stored. */
export function replyKeyFor(inboundKey: string): string {
  return `reply:${inboundKey}`;
}
