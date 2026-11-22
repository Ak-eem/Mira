import { IMPORT_TEMPLATE_CSV, MAX_IMPORT_ROWS, parseCsv, parsePrice, parseProductsCsv } from "./csvImport";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

// Prices people really write.
check(parsePrice("450000") === 450000, "plain number");
check(parsePrice("₦450,000") === 450000, "naira sign and commas");
check(parsePrice("NGN 1,450,000.50") === 1450000.5, "NGN prefix and decimals");
check(parsePrice("450k") === 450000, "k means thousand");
check(parsePrice("1.2m") === 1200000, "m means million");
check(parsePrice("N75000") === 75000, "N prefix");
check(parsePrice("call us") === null && parsePrice("") === null && parsePrice("-5") === null, "words, empty and negative are rejected");

// Quotes and commas.
const quoted = parseCsv('a,"b, c","say ""hi"""\n', ",");
check(quoted[0].cells.join("|") === 'a|b, c|say "hi"', "quoted comma and doubled quote");
const multiline = parseCsv('name,notes\nX,"line one\nline two"\nY,ok', ",");
check(multiline.length === 3 && multiline[2].line === 4, "a quoted line break stays in one cell and later line numbers are right");

// The template we give people must import cleanly.
const template = parseProductsCsv(IMPORT_TEMPLATE_CSV);
check(template.fatal === null && template.rows.length === 2 && template.problems.length === 0, "the downloadable template imports with no problems");
check(template.rows[1].description === "New, sealed. 512GB" && template.rows[0].stockQuantity === 3, "template values read correctly");

// Header variety, BOM and Excel-style separators.
const messy = parseProductsCsv("﻿Product Name;Selling Price;Qty\nTecno Camon 30;₦230,000;10\nInfinix Hot 40;185k;\n");
check(messy.fatal === null && messy.rows.length === 2, "semicolons, BOM and alternative header names");
check(messy.rows[1].price === 185000 && messy.rows[1].stockQuantity === null, "blank stock means untracked");
const tabs = parseProductsCsv("name\tprice\nPower bank 20000mAh\t18,500\n");
check(tabs.rows.length === 1 && tabs.rows[0].price === 18500, "tab-separated (pasted from a sheet)");

// Problems are reported per line, good rows still import.
const mixed = parseProductsCsv("name,price,stock\nGood item,1000,2\n,500,1\nBad price,abc,1\nBad stock,500,-3\nGood item,999,1\nOther,1500,x\n");
check(mixed.rows.length === 1, "only the good row is kept");
check(mixed.problems.length === 5, "each bad row is reported");
check(mixed.problems.some((p) => p.line === 3 && /No name/.test(p.message)), "missing name is reported on its line");
check(mixed.problems.some((p) => /already in this file/.test(p.message)), "duplicate names in a file are skipped");

// Whole-file problems.
check(parseProductsCsv("").fatal !== null, "empty file");
check(parseProductsCsv("name,price\n").fatal !== null, "header only");
check(/"price" column/.test(parseProductsCsv("name,colour\nX,red\n").fatal ?? ""), "missing price column explains what was found");
const big = "name,price\n" + Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Item ${i},100`).join("\n");
check(parseProductsCsv(big).fatal !== null, "over the row limit asks to split");

// A comma-formatted price without quotes must not silently shift columns (price 1, stock 450).
const shifted = parseProductsCsv("name,price,stock\niPhone,1,450,000,3\nGood,1000,2\nQuoted,\"1,450,000\",3\n");
check(shifted.rows.length === 2 && shifted.rows.some((r) => r.name === "Quoted" && r.price === 1450000), "quoted comma prices work");
check(shifted.problems.length === 1 && /put it in quotes/.test(shifted.problems[0].message), "unquoted comma price is refused with a fix, not misread");
check(parseProductsCsv("name,price\nTrailing,500,,\n").rows.length === 1, "trailing empty cells are fine");
