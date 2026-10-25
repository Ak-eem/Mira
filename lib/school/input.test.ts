import { parseClassLabel, parseAmountNaira, validateDateRange, parseStudentRows, MAX_IMPORT_ROWS } from "./input";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

check(same(parseClassLabel("JSS 1 A"), { name: "JSS 1", arm: "A" }), "'JSS 1 A' splits into class JSS 1, arm A");
check(same(parseClassLabel("jss 2 b"), { name: "jss 2", arm: "B" }), "arm is upper-cased");
check(same(parseClassLabel("Primary 3"), { name: "Primary 3", arm: "A" }), "no arm defaults to A");
check(same(parseClassLabel("Basic 4 Gold"), { name: "Basic 4 Gold", arm: "A" }), "a word is not mistaken for an arm");
check(same(parseClassLabel("Nursery"), { name: "Nursery", arm: "A" }), "a lone word like Nursery is a class name");
check(parseClassLabel("   ") === null, "blank class is rejected");

check(parseAmountNaira("150000") === 150000, "plain amount");
check(parseAmountNaira("₦150,000") === 150000, "naira sign and commas");
check(parseAmountNaira("NGN 150,000.50") === 150000.5, "NGN prefix and kobo");
check(parseAmountNaira("-5") === null && parseAmountNaira("abc") === null && parseAmountNaira("") === null, "negative, text and empty amounts are rejected");
check(parseAmountNaira("1.234") === null, "three decimal places is rejected");

check(validateDateRange("2026-09-14", "2026-12-18") === null, "valid date range");
check(validateDateRange("2026-12-18", "2026-09-14") !== null, "end before start is rejected");
check(validateDateRange("2026-02-30", "2026-03-10") !== null, "impossible date is rejected");
check(validateDateRange("", "2026-03-10") !== null, "missing date is rejected");

const good = parseStudentRows("A001,Ada Obi,JSS 1 A,Mrs Obi,08031234567,ada@example.com\nA002,Tunde Bello,Primary 3,,,");
check(good.errors.length === 0 && good.rows.length === 2, "two valid rows parse");
check(good.rows[0].guardianPhone === "08031234567" && good.rows[0].classRef.arm === "A", "phone and class kept");
check(good.rows[1].guardianName === null && good.rows[1].guardianPhone === null, "optional columns can be empty");

const withHeader = parseStudentRows("Admission No,Full Name,Class,Guardian,Phone,Email\nA001,Ada Obi,JSS 1 A,Mrs Obi,08031234567,");
check(withHeader.rows.length === 1 && withHeader.errors.length === 0, "header row is skipped");

const tabs = parseStudentRows("A001\tAda Obi\tJSS 1 A\tMrs Obi\t+234 803 123 4567\t");
check(tabs.rows.length === 1 && tabs.rows[0].guardianPhone === "+234 803 123 4567", "tab-separated (pasted from Excel) works");

const quoted = parseStudentRows('A001,"Obi, Ada",JSS 1 A');
check(quoted.rows[0]?.fullName === "Obi, Ada", "quoted comma stays inside the name");

const bad = parseStudentRows("A001,Ada Obi,JSS 1 A,,12345,\nA002,,JSS 1 A\n,Tunde,JSS 1 A\nA004,Bola,JSS 1 A,,,not-an-email\nA005,Sade,\nA006,Sade,JSS 1 A");
check(bad.rows.length === 1 && bad.rows[0].admissionNo === "A006", "only the one good row survives");
check(bad.errors.length === 5 && bad.errors.map((e) => e.line).join() === "1,2,3,4,5", "each bad row is reported with its line number");

const dup = parseStudentRows("A001,Ada,JSS 1 A\na001,Ada Again,JSS 1 A");
check(dup.rows.length === 1 && dup.errors.length === 1 && dup.errors[0].line === 2, "duplicate admission number is flagged (case-insensitive)");

const many = parseStudentRows(Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => `A${i},Student ${i},JSS 1 A`).join("\n"));
check(many.rows.length === MAX_IMPORT_ROWS && many.errors.length === 1, "imports are capped and the cap is reported");
check(parseStudentRows("").rows.length === 0 && parseStudentRows("\n\n").errors.length === 0, "empty paste is harmless");
