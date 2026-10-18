import { tooltipFor } from "./barTooltip";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }
const pts = [{ label: "Oct 11", value: 2, secondary: 0 }, { label: "Oct 12", value: 6, secondary: 1 }, { label: "Oct 13", value: 6, secondary: 3 }, { label: "Oct 14", value: 2, secondary: 0 }];
const names = ["Conversations", "Human help"];

const t1 = tooltipFor(pts, 1, names)!;
check("label and both series appear", t1.label === "Oct 12" && t1.rows.length === 2 && t1.rows[0].name === "Conversations" && t1.rows[1].name === "Human help");
check("share is of the period total (6 of 16 = 38%)", t1.rows[0].share === "38%");
check("secondary share (1 of 4 = 25%)", t1.rows[1].share === "25%");
check("change vs the previous bar", t1.change?.text === "+4 vs Oct 11" && t1.change.direction === "up");
check("a drop uses a real minus sign", tooltipFor(pts, 3, names)!.change?.text === "\u22124 vs Oct 13");
check("equal to the previous bar says so", tooltipFor(pts, 2, names)!.change?.direction === "flat");
check("the first bar has no change", tooltipFor(pts, 0, names)!.change === null);
check("one-series charts have one row", tooltipFor([{ label: "Groq", value: 12 }], 0, ["AI replies"])!.rows.length === 1);
check("an all-zero period does not divide by zero", tooltipFor([{ label: "a", value: 0 }], 0, ["x"])!.rows[0].share === "0%");
check("an out-of-range index returns null", tooltipFor(pts, 9, names) === null);
check("the suffix is used in the change text", tooltipFor([{ label: "a", value: 90 }, { label: "b", value: 95 }], 1, ["Rate"], "%")!.change?.text === "+5% vs a");
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
