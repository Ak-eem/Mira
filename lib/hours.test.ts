import { isOpenNow } from "./hours";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }

check("no hours at all is unknown (null), not Closed", isOpenNow([], "Africa/Lagos") === null);
check("rows with no times (every day closed) are unknown too", isOpenNow([0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, opens_at: null, closes_at: null })), "Africa/Lagos") === null);
const allDay = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, opens_at: "00:00", closes_at: "23:59" }));
check("open all day is true", isOpenNow(allDay, "Africa/Lagos") === true);
const oneDay = [{ day_of_week: 99, opens_at: "09:00", closes_at: "17:00" }];
check("hours set but nothing for today is false (closed today)", isOpenNow(oneDay, "Africa/Lagos") === false);
check("a bad timezone does not throw", isOpenNow(allDay, "Not/AZone") === null);
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
