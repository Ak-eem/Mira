export type Member = { user_id: string; role: string };

// Who hears about a handoff: the team members (role "staff") who answer customers. If the
// business has not added any, fall back to the owner, so a customer is never left waiting
// with nobody told, and tell the owner they can add their customer service people.
export function planHandoffRecipients(members: Member[]): { userIds: string[]; fallbackToOwner: boolean } {
  const staff = members.filter((m) => m.role === "staff").map((m) => m.user_id);
  if (staff.length > 0) return { userIds: staff, fallbackToOwner: false };
  const owners = members.filter((m) => m.role === "owner").map((m) => m.user_id);
  return { userIds: owners, fallbackToOwner: owners.length > 0 };
}
