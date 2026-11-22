// Turns a spreadsheet export (CSV, or text pasted from Excel / Google Sheets) into product rows.
//
// This file does no saving and talks to no database: text goes in, checked rows and readable problems come out.
// Keeping it pure is what makes it easy to test, and it is the same code that runs for the owner and for Mira staff.

export const MAX_IMPORT_ROWS = 1000;

export type ImportRow = {
  name: string;
  description: string;
  price: number;
  stockQuantity: number | null;
};

export type ImportProblem = { line: number; message: string };

export type ImportParse = {
  rows: ImportRow[];
  problems: ImportProblem[];
  // Set when the file itself cannot be used at all (no name column, empty, too long).
  fatal: string | null;
};

// Column titles people actually use, mapped to what we store. Compared in lower case with extra spaces removed.
const COLUMN_ALIASES: Record<"name" | "price" | "description" | "stock", string[]> = {
  name: ["name", "product", "product name", "item", "item name", "title", "model"],
  price: ["price", "selling price", "unit price", "amount", "cost", "price (ngn)", "price (₦)", "price ngn"],
  description: ["description", "details", "specs", "specification", "specifications", "about", "notes", "note"],
  stock: ["stock", "quantity", "qty", "stock quantity", "in stock", "units", "available quantity"],
};

function normaliseHeader(cell: string): string {
  return cell.replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumn(headers: string[], key: keyof typeof COLUMN_ALIASES): number {
  return headers.findIndex((h) => COLUMN_ALIASES[key].includes(h));
}

// Spreadsheets save with commas, Excel in some countries with semicolons, and a copy-paste from a sheet uses tabs.
// Look at the first line only and pick whichever appears most.
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: [string, number][] = [
    ["\t", firstLine.split("\t").length - 1],
    [";", firstLine.split(";").length - 1],
    [",", firstLine.split(",").length - 1],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

// A small CSV reader that understands quotes: "Apple iPhone 15, 256GB" stays one cell, "" is a literal quote,
// and a quoted cell may even contain a line break. Returns each row with the line number it started on.
export function parseCsv(text: string, delimiter: string): { cells: string[]; line: number }[] {
  const rows: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const endCell = () => {
    cells.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    // Skip rows that are completely empty (blank lines at the end of a file, for example).
    if (cells.some((c) => c.trim() !== "")) rows.push({ cells, line: rowLine });
    cells = [];
    // The line counter has already moved past this row's line break, so the next row starts right here.
    rowLine = line;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line += 1;
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      inQuotes = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === "\n") {
      line += 1;
      endRow();
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell !== "" || cells.length > 0) endRow();
  return rows;
}

// "₦450,000", "450000", "NGN 450,000.50", "450k" and "1.2m" all become numbers. Anything else is null.
export function parsePrice(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/[₦,\s]/g, "").replace(/^ngn/, "").replace(/^n(?=\d)/, "");
  const match = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(text);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function parseProductsCsv(input: string): ImportParse {
  const text = input.replace(/^﻿/, "");
  if (text.trim() === "") return { rows: [], problems: [], fatal: "The file is empty." };

  const table = parseCsv(text, detectDelimiter(text));
  if (table.length < 2) return { rows: [], problems: [], fatal: "Add a header row (name, price) and at least one product under it." };

  const headers = table[0].cells.map(normaliseHeader);
  const nameCol = findColumn(headers, "name");
  const priceCol = findColumn(headers, "price");
  if (nameCol === -1 || priceCol === -1) {
    return {
      rows: [],
      problems: [],
      fatal: `The first row needs a "name" column and a "price" column. Found: ${headers.filter(Boolean).join(", ") || "nothing readable"}.`,
    };
  }
  const descriptionCol = findColumn(headers, "description");
  const stockCol = findColumn(headers, "stock");

  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    return { rows: [], problems: [], fatal: `That file has ${body.length} products. Import up to ${MAX_IMPORT_ROWS} at a time; split the file and import it in parts.` };
  }

  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Map<string, number>();

  for (const { cells, line } of body) {
    // More cells than headers almost always means a price like 1,450,000 was written without quotes in a comma file,
    // which would silently shift every later column (price 1, stock 450). Refuse the row instead of guessing.
    const used = cells.length - [...cells].reverse().findIndex((c) => c.trim() !== "") ;
    if (used > headers.length) {
      problems.push({ line, message: `"${(cells[nameCol] ?? "").trim().slice(0, 40)}": has ${used} values but the header has ${headers.length}. If a price has commas (1,450,000), put it in quotes or remove the commas.` });
      continue;
    }
    const name = (cells[nameCol] ?? "").trim().replace(/\s+/g, " ");
    if (!name) {
      problems.push({ line, message: "No name." });
      continue;
    }
    if (name.length > 200) {
      problems.push({ line, message: `"${name.slice(0, 30)}…" has a name longer than 200 characters.` });
      continue;
    }

    const price = parsePrice(cells[priceCol] ?? "");
    if (price === null) {
      problems.push({ line, message: `"${name}": price "${(cells[priceCol] ?? "").trim()}" is not a number.` });
      continue;
    }

    let stockQuantity: number | null = null;
    const rawStock = stockCol === -1 ? "" : (cells[stockCol] ?? "").trim();
    if (rawStock !== "") {
      const stock = Number(rawStock.replace(/,/g, ""));
      if (!Number.isInteger(stock) || stock < 0) {
        problems.push({ line, message: `"${name}": stock "${rawStock}" must be a whole number, 0 or more.` });
        continue;
      }
      stockQuantity = stock;
    }

    const key = name.toLowerCase();
    const firstLine = seen.get(key);
    if (firstLine !== undefined) {
      problems.push({ line, message: `"${name}" is already in this file (line ${firstLine}); skipped.` });
      continue;
    }
    seen.set(key, line);

    rows.push({
      name,
      description: descriptionCol === -1 ? "" : (cells[descriptionCol] ?? "").trim().slice(0, 1000),
      price,
      stockQuantity,
    });
  }

  return { rows, problems, fatal: null };
}

export const IMPORT_TEMPLATE_CSV = "name,price,stock,description\nApple iPhone 15 Pro 256GB,1450000,3,UK used. Battery health 92%. 6 months warranty\nSamsung Galaxy S24 Ultra,1650000,2,\"New, sealed. 512GB\"\n";
