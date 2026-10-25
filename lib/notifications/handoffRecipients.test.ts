import { planHandoffRecipients } from "./handoffRecipients";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

const owner = { user_id: "o1", role: "owner" };
const staffA = { user_id: "s1", role: "staff" };
const staffB = { user_id: "s2", role: "staff" };

const withTeam = planHandoffRecipients([owner, staffA, staffB]);
check(JSON.stringify(withTeam.userIds) === JSON.stringify(["s1", "s2"]) && !withTeam.fallbackToOwner, "with a team, only team members are told and the owner is left out");

const noTeam = planHandoffRecipients([owner]);
check(JSON.stringify(noTeam.userIds) === JSON.stringify(["o1"]) && noTeam.fallbackToOwner, "with no team, the owner is told and reminded to add their customer service people");

const nobody = planHandoffRecipients([]);
check(nobody.userIds.length === 0 && !nobody.fallbackToOwner, "a business with no members produces no recipients and no reminder");

const twoOwners = planHandoffRecipients([owner, { user_id: "o2", role: "owner" }]);
check(twoOwners.userIds.length === 2 && twoOwners.fallbackToOwner, "several owners and no team: every owner is told");
