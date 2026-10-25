// Pure parsing/validation for the school portal. No I/O, so every rule here is
// covered by input.test.ts. The server actions call these first and only then
// touch the database.

export const MAX_IMPORT_ROWS = 1000;
export const DEFAULT_ARM = "A";

export type ClassRef = { name: string; arm: string };

export type ParsedStudent = {
  admissionNo: string;
  fullName: string;
  classRef: ClassRef;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
};

export type RowError = { line: number; message: string };

// "JSS 1 A" -> { name: "JSS 1", arm: "A" }; "Primary 3" -> { name: "Primary 3", arm: "A" }.
// Only a single trailing letter counts as the arm, so "Basic 4 Gold" stays one class name
// rather than guessing that "Gold" is an arm.
export function parseClassLabel(label: string): ClassRef | null {
  const cleaned = label.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const match = cleaned.match(/^(.*\S)\s+([A-Za-z])$/);
  if (match && /\d/.test(match[1])) {
    return { name: match[1], arm: match[2].toUpperCase() };
  }
  return { name: cleaned, arm: DEFAULT_ARM };
}

export function classLabel(c: ClassRef): string {
  return `${c.name} ${c.arm}`;
}

// Accepts "150000", "150,000", "₦150,000", "NGN 150,000.50". Rejects negatives and junk.
export function parseAmountNaira(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]|ngn/gi, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 && value < 1_000_000_000 ? value : null;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function validateDateRange(start: string, end: string): string | null {
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) return "Enter both dates.";
  if (end < start) return "The end date can't be before the start date.";
  return null;
}

// Splits one line on tab (pasted from a spreadsheet) or comma, honouring "quoted, fields".
function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { cells.push(current.trim()); current = ""; }
    else current += ch;
  }
  cells.push(current.trim());
  return cells;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Columns, in order: admission number, full name, class, guardian name, guardian phone,
// guardian email. The last three are optional. A header row is detected and skipped.
export function parseStudentRows(text: string): { rows: ParsedStudent[]; errors: RowError[] } {
  const rows: ParsedStudent[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  let dataRows = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const line = i + 1;
    const cells = splitLine(raw);

    if (dataRows === 0 && /admission|adm\.?\s*no|reg/i.test(cells[0] ?? "") && /name/i.test(cells[1] ?? "")) {
      dataRows++; // header row, skipped
      continue;
    }
    dataRows++;
    if (rows.length + errors.length >= MAX_IMPORT_ROWS) {
      errors.push({ line, message: `Too many rows. Import up to ${MAX_IMPORT_ROWS} students at a time.` });
      break;
    }

    const [admissionNo = "", fullName = "", classText = "", guardianName = "", phone = "", email = ""] = cells;
    if (!admissionNo) { errors.push({ line, message: "Missing admission number." }); continue; }
    if (!fullName) { errors.push({ line, message: "Missing student name." }); continue; }
    const classRef = parseClassLabel(classText);
    if (!classRef) { errors.push({ line, message: "Missing class." }); continue; }

    let guardianPhone: string | null = null;
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) { errors.push({ line, message: `"${phone}" doesn't look like a phone number.` }); continue; }
      guardianPhone = phone;
    }
    if (email && !EMAIL.test(email)) { errors.push({ line, message: `"${email}" doesn't look like an email address.` }); continue; }

    const key = admissionNo.toLowerCase();
    if (seen.has(key)) { errors.push({ line, message: `Admission number ${admissionNo} already appears on line ${seen.get(key)}.` }); continue; }
    seen.set(key, line);

    rows.push({
      admissionNo,
      fullName,
      classRef,
      guardianName: guardianName || null,
      guardianPhone,
      guardianEmail: email || null,
    });
  }
  return { rows, errors };
}
