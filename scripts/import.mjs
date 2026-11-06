// Import script: turns data/ingredients.xlsx into src/data/ingredients.json.
//
// Run it with:  npm run import
//
// Rules this script follows:
//   - Never invent data. Anything missing in the spreadsheet stays null.
//   - Values in data/filled-in.json are only used where the spreadsheet cell is empty,
//     and they are marked as "filled" so the site can badge them.
//   - Nothing is silently dropped. Columns we don't recognise go into `extra`,
//     and every skipped row is listed in the summary.

import * as fs from "node:fs";
import * as XLSX from "xlsx";

XLSX.set_fs(fs);

const SPREADSHEET = "data/ingredients.xlsx";
const FILLED_IN = "data/filled-in.json";
const OUTPUT = "src/data/ingredients.json";

// A typed cost per gram that differs from cost ÷ size by more than this is flagged.
const PRICE_MISMATCH_TOLERANCE = 0.05; // 5%

// Fixed packaging fees some suppliers add per bottle (PerfumersWorld: $0.90).
// A cost per gram that leaves the fee out, (cost − fee) ÷ size, is accepted too.
const PACKAGING_FEES = [0.9];

// ---------------------------------------------------------------------------
// 1. Which spreadsheet column feeds which field.
//    Header text is compared case-insensitively. Add a spelling here if you
//    rename a column in Excel. Unrecognised columns end up in `extra`.
// ---------------------------------------------------------------------------
const COLUMN_ALIASES = {
  name: ["ingredient name", "ingredient", "name", "material"],
  pricePerGram: ["cost/gram", "cost per gram", "price/gram", "price per gram"],
  bottlePrice: ["cost", "price", "bottle price"],
  bottleSizeGrams: ["size (grams)", "size (g)", "size", "quantity (g)"],
  cas: ["cas number", "cas", "cas no", "cas #"],
  ifraRestriction: ["ifra restrictions", "ifra restriction", "ifra"],
  averageUse: ["average use", "typical use"],
  category: ["category", "type"],
  synonyms: ["synonyms", "trade names", "other names"],
  odorFamily: ["odor family", "odour family", "scent family"],
  odorDescription: ["odor description", "odour description", "odor", "odour"],
  supplier: ["supplier", "vendor"],
};

// Header text with any "(USD)" or "51" style suffix removed, for matching.
function headerKey(header) {
  return header
    .toLowerCase()
    .replace(/\((usd|eur|gbp|cad|aud)\)/g, "")
    .replace(/\b\d+\b/g, "") // "IFRA 51 Restrictions" -> "ifra restrictions"
    .replace(/\s+/g, " ")
    .trim();
}

function fieldForHeader(header) {
  const key = headerKey(header);
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. Cleaning helpers
// ---------------------------------------------------------------------------

// Values that mean "nothing here" ("TBD" = not looked up yet). Note: "None" is NOT in
// this list, because in the IFRA column "None" means "no restriction", which is real information.
const BLANK_TOKENS = new Set(["", "n/a", "na", "-", "–", "—", "#n/a", "null", "tbd"]);

/** Trim, collapse repeated spaces, and turn blank-like values into null. */
function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return BLANK_TOKENS.has(text.toLowerCase()) ? null : text;
}

/** Parse a number like 12.5, "$12.50" or "1,200". Returns null if it can't. */
function parseNumber(value) {
  if (typeof value === "number") return value;
  const text = cleanText(value);
  if (text === null) return null;
  const stripped = text.replace(/[$€£¥,\s]|USD|EUR|GBP/gi, "");
  const number = Number(stripped);
  return Number.isFinite(number) && stripped !== "" ? number : NaN; // NaN = unreadable
}

/** "Damascone Delta 10% DPG" -> "damascone-delta-10-dpg" */
function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Name comparison that ignores case and extra spaces. */
const sameName = (a) => a.replace(/\s+/g, " ").trim().toLowerCase();

// ---------------------------------------------------------------------------
// 3. CAS numbers
// ---------------------------------------------------------------------------

/**
 * CAS check digit: take every digit except the last, multiply each by its
 * position counted from the right (1, 2, 3...), add them up, and the total
 * mod 10 must equal the last digit. Example: 78-70-6 -> 7*4+8*3+7*2+0*1 = 66 -> 6.
 */
function casCheckDigitOk(cas) {
  const match = /^(\d{2,7})-(\d{2})-(\d)$/.exec(cas);
  if (!match) return false;
  const digits = (match[1] + match[2]).split("").reverse();
  const sum = digits.reduce((total, d, i) => total + Number(d) * (i + 1), 0);
  return sum % 10 === Number(match[3]);
}

/**
 * Excel sometimes turns a CAS number like 8014-09-3 into the date 3 Sep 8014.
 * The digits can be read back exactly from the date: year-month-day.
 */
function casFromExcelDate(serial) {
  // Excel's day 0 is 30 Dec 1899. JavaScript dates handle years past 9999,
  // which matters for numbers like 14901-07-6.
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return { cas: `${year}-${month}-${date.getUTCDate()}`, year };
}

/**
 * Reads the CAS cell. Returns:
 *   cas:      list of CAS numbers (natural materials can have several)
 *   casValid: true / false, or null when there is no CAS to check
 *   notes:    plain-English notes about anything odd
 */
function parseCas(cell) {
  const result = { cas: [], casValid: null, notes: [] };
  if (!cell || cell.v === undefined || cell.v === null) return result;

  // Case 1: Excel stored the CAS number as a date.
  if (cell.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) {
    const { cas, year } = casFromExcelDate(cell.v);
    result.notes.push(
      `Excel stored this CAS number as a date; the digits ${cas} were read back from it. Re-type the cell as text to fix it.`,
    );
    // Excel turns 2-digit years into 1930-2029, so the first part can't be trusted then.
    if (year >= 1930 && year <= 2029) {
      result.notes.push("The first part may originally have had only 2 digits, so this one can't be recovered with certainty.");
      result.cas = [cas];
      result.casValid = false;
      return result;
    }
    result.cas = [cas];
    result.casValid = casCheckDigitOk(cas);
    return result;
  }

  const text = cleanText(cell.v);
  if (text === null) return result;

  // Case 2: mixtures have no single CAS number.
  if (/^mixture$/i.test(text)) {
    result.notes.push(`Jin's spreadsheet says "Mixture" (no single CAS number).`);
    return result;
  }

  // Case 3: one or more CAS numbers, separated by ; , / or "and"/"or".
  const parts = text.split(/\s*[;,/\n]\s*|\s+(?:and|or)\s+/i).filter(Boolean);
  for (const part of parts) {
    // Leading zeros carry no meaning in CAS numbers: 0106-02-05 is 106-02-5.
    const tidy = part.replace(/^0*(\d+)-(\d{2})-0*(\d)$/, "$1-$2-$3");
    if (tidy !== part) result.notes.push(`Leading zeros removed (spreadsheet has ${part}).`);
    if (!/^\d{2,7}-\d{2}-\d$/.test(tidy)) {
      result.notes.push(`"${part}" isn't in CAS format (like 78-70-6). It may be a product code.`);
    } else if (!casCheckDigitOk(tidy)) {
      result.notes.push(`${tidy} fails the CAS check-digit test, so at least one digit is wrong.`);
    }
    result.cas.push(tidy);
  }
  result.casValid = result.cas.every(casCheckDigitOk);
  return result;
}

// ---------------------------------------------------------------------------
// 4. Read the spreadsheet
// ---------------------------------------------------------------------------
const workbook = XLSX.readFile(SPREADSHEET, { cellNF: true }); // cellNF keeps number formats (to spot dates)
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const range = XLSX.utils.decode_range(sheet["!ref"]);

const cellAt = (row, col) => sheet[XLSX.utils.encode_cell({ r: row, c: col })];

// Header row -> column map
const columns = []; // [{ col, header, field }]
for (let c = range.s.c; c <= range.e.c; c++) {
  const header = cleanText(cellAt(range.s.r, c)?.v) ?? `Column ${XLSX.utils.encode_col(c)}`;
  columns.push({ col: c, header, field: fieldForHeader(header) });
}
const nameColumn = columns.find((c) => c.field === "name");
if (!nameColumn) {
  console.error(`Couldn't find an ingredient name column in "${sheetName}". Headers: ${columns.map((c) => c.header).join(", ")}`);
  process.exit(1);
}
// Currency comes from a header like "Cost (USD)".
const currency = columns.map((c) => /\(([A-Z]{3})\)/.exec(c.header)?.[1]).find(Boolean) ?? null;

// The site shows your own column names as labels.
const labels = {};
for (const c of columns) if (c.field) labels[c.field] = c.header;

const ingredients = [];
const skipped = []; // { row, reason }
const problems = []; // things to fix in the spreadsheet
let blankRows = 0;

for (let r = range.s.r + 1; r <= range.e.r; r++) {
  const rowNumber = r + 1; // the number Excel shows
  const raw = {}; // field -> cell
  const extra = {};
  let hasAnything = false;

  for (const { col, header, field } of columns) {
    const cell = cellAt(r, col);
    if (cell && cleanText(cell.v) !== null) hasAnything = true;
    if (field) raw[field] = cell;
    else if (cell && cleanText(cell.v) !== null) extra[header] = typeof cell.v === "number" ? cell.v : cleanText(cell.v);
  }

  if (!hasAnything) {
    blankRows++;
    continue;
  }
  const name = cleanText(raw.name?.v);
  if (!name) {
    skipped.push({ row: rowNumber, reason: "has data but no ingredient name" });
    continue;
  }

  const warnings = [];

  // --- Prices -------------------------------------------------------------
  const readNumber = (field) => {
    const n = parseNumber(raw[field]?.v);
    if (Number.isNaN(n)) {
      warnings.push(`Couldn't read "${raw[field].v}" in ${labels[field]} as a number.`);
      return null;
    }
    return n;
  };
  const sheetPricePerGram = readNumber("pricePerGram");
  const bottlePrice = readNumber("bottlePrice");
  const bottleSizeGrams = readNumber("bottleSizeGrams");

  if (bottleSizeGrams === 0) warnings.push(`${labels.bottleSizeGrams ?? "Size"} is 0, so cost per gram can't be calculated.`);
  const calculatedPricePerGram =
    bottlePrice !== null && bottleSizeGrams ? bottlePrice / bottleSizeGrams : null;

  // Your own cost/gram wins. Only calculate it when that cell is empty.
  const pricePerGram = sheetPricePerGram ?? calculatedPricePerGram;
  const priceIsCalculated = sheetPricePerGram === null && calculatedPricePerGram !== null;
  const money = (n, digits) => (currency === "USD" ? "$" : "") + n.toFixed(digits);
  const gap = (a, b) => Math.abs(a - b) / b; // relative difference
  let priceMismatch = false;
  let priceNote = null;
  if (sheetPricePerGram !== null && calculatedPricePerGram !== null) {
    // Does it fit better once a packaging fee is left out?
    const plainGap = gap(sheetPricePerGram, calculatedPricePerGram);
    const fee = PACKAGING_FEES.find((f) => {
      const feeGap = bottlePrice > f ? gap(sheetPricePerGram, (bottlePrice - f) / bottleSizeGrams) : Infinity;
      return feeGap <= PRICE_MISMATCH_TOLERANCE && feeGap < plainGap;
    });
    if (fee !== undefined) {
      priceNote = `Leaves out the ${money(fee, 2)} packaging fee: (${money(bottlePrice, 2)} − ${money(fee, 2)}) ÷ ${bottleSizeGrams} g = ${money((bottlePrice - fee) / bottleSizeGrams, 3)}.`;
    } else if (plainGap > PRICE_MISMATCH_TOLERANCE) {
      priceMismatch = true;
      warnings.push(
        `Cost per gram is ${money(sheetPricePerGram, 2)}, but cost ÷ size is ${money(bottlePrice, 2)} ÷ ${bottleSizeGrams} g = ${money(calculatedPricePerGram, 3)}.`,
      );
    }
  }

  // --- CAS ---------------------------------------------------------------
  const { cas, casValid, notes: casNotes } = parseCas(raw.cas);

  // --- Text fields ---------------------------------------------------------
  const synonymsText = cleanText(raw.synonyms?.v);

  ingredients.push({
    id: "", // assigned below, once we know about duplicate names
    rowNumber,
    name,
    // Separate synonyms with semicolons: chemical names like "2,6-Dimethyl..." contain commas.
    synonyms: synonymsText ? synonymsText.split(/\s*;\s*/).filter(Boolean) : [],
    cas,
    casValid,
    casNotes,
    category: cleanText(raw.category?.v),
    odorFamily: cleanText(raw.odorFamily?.v),
    odorDescription: cleanText(raw.odorDescription?.v),
    supplier: cleanText(raw.supplier?.v),
    pricePerGram,
    currency: pricePerGram !== null ? currency : null,
    priceIsCalculated,
    calculatedPricePerGram,
    priceMismatch,
    priceNote,
    bottlePrice,
    bottleSizeGrams,
    ifraRestriction: cleanText(raw.ifraRestriction?.v),
    averageUse: cleanText(raw.averageUse?.v),
    extra,
    // A row with no price, cost or size yet is a wishlist item (not bought yet).
    wishlist: sheetPricePerGram === null && bottlePrice === null && bottleSizeGrams === null,
    duplicates: [],
    sameCasAs: [],
    warnings,
    filled: {},
    filledNote: null,
    ifraCheck: null, // what an IFRA value from your sheet was checked against
    casCheck: null, // same for a CAS number
  });
}

// ---------------------------------------------------------------------------
// 5. Ids (unique slugs) and duplicate checks
// ---------------------------------------------------------------------------
const usedIds = new Map();
for (const ing of ingredients) {
  const base = slugify(ing.name) || `row-${ing.rowNumber}`;
  const count = (usedIds.get(base) ?? 0) + 1;
  usedIds.set(base, count);
  ing.id = count === 1 ? base : `${base}-${count}`;
}

const byName = Map.groupBy(ingredients, (i) => sameName(i.name));
for (const group of byName.values()) {
  if (group.length < 2) continue;
  for (const ing of group) {
    ing.duplicates = group.filter((o) => o !== ing).map((o) => o.id);
    ing.warnings.push(
      `Same name as ${group.filter((o) => o !== ing).map((o) => `row ${o.rowNumber}`).join(", ")}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 6. Merge filled-in values (only where the spreadsheet is empty)
// ---------------------------------------------------------------------------
const filledIn = fs.existsSync(FILLED_IN) ? JSON.parse(fs.readFileSync(FILLED_IN, "utf8")).ingredients : {};
const filledCounts = { cas: 0, category: 0, odorFamily: 0, synonyms: 0, ifraRestriction: 0 };
const unmatchedFilled = [];

for (const [filledName, values] of Object.entries(filledIn)) {
  const matches = byName.get(sameName(filledName));
  if (!matches) {
    unmatchedFilled.push(filledName);
    continue;
  }
  for (const ing of matches) {
    if (values.note) ing.filledNote = values.note;
    for (const field of ["category", "odorFamily"]) {
      if (values[field] && ing[field] === null) {
        ing[field] = values[field];
        ing.filled[field] = { source: null, check: null };
        filledCounts[field]++;
      }
    }
    // Skip synonyms that are just the ingredient's own name spelled differently
    // (ignoring case, spaces and hyphens), e.g. "Phenylacetaldehyde dimethyl acetal".
    const squash = (text) => text.toLowerCase().replace(/[\s-]/g, "");
    const synonyms = (values.synonyms ?? []).filter((s) => squash(s) !== squash(ing.name));
    if (synonyms.length && ing.synonyms.length === 0) {
      ing.synonyms = synonyms;
      ing.filled.synonyms = { source: "PubChem", check: null };
      filledCounts.synonyms++;
    }
    // IFRA: fill in only when your cell is empty; otherwise keep your value and
    // record what it was checked against.
    if (values.ifra) {
      const info = { source: values.ifra.source ?? null, check: values.ifra.check ?? null };
      if (values.ifra.value && ing.ifraRestriction === null) {
        ing.ifraRestriction = values.ifra.value;
        ing.filled.ifraRestriction = info;
        filledCounts.ifraRestriction++;
      } else if (ing.ifraRestriction !== null) {
        ing.ifraCheck = info;
      }
    }
    // A CAS is only filled in when the spreadsheet cell is completely empty.
    if (values.cas && ing.cas.length === 0 && ing.casNotes.length === 0) {
      ing.cas = [values.cas];
      ing.casValid = casCheckDigitOk(values.cas);
      ing.filled.cas = { source: values.casSource ?? null, check: values.casCheck ?? null };
      filledCounts.cas++;
    } else if (values.cas && ing.cas.includes(values.cas) && values.casSource) {
      // Your CAS matches the researched one: keep showing where it was checked.
      ing.casCheck = { source: values.casSource, check: values.casCheck ?? null };
    }
  }
}

// Rows that share a CAS number (checked after filling in).
const byCas = new Map();
for (const ing of ingredients) for (const cas of ing.cas) byCas.set(cas, [...(byCas.get(cas) ?? []), ing]);
for (const [cas, group] of byCas) {
  const names = new Set(group.map((i) => sameName(i.name)));
  if (names.size < 2) continue; // same name = already reported as a duplicate
  for (const ing of group) {
    const others = group.filter((o) => sameName(o.name) !== sameName(ing.name));
    ing.sameCasAs = others.map((o) => o.id);
    ing.warnings.push(`Same CAS number (${cas}) as ${others.map((o) => `${o.name} (row ${o.rowNumber})`).join(", ")}.`);
  }
}

// CAS notes and missing price become warnings too, so the detail page lists everything in one place.
// (A "Mixture" note isn't a problem, so it stays out of the warnings.)
for (const ing of ingredients) {
  ing.warnings.unshift(...ing.casNotes.filter((note) => !note.includes('"Mixture"')));
  if (ing.pricePerGram === null && !ing.wishlist) ing.warnings.push("No price.");
}

// ---------------------------------------------------------------------------
// 7. Write the JSON and print a summary
// ---------------------------------------------------------------------------
fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync(
  OUTPUT,
  JSON.stringify({ importedAt: new Date().toISOString(), sourceSheet: sheetName, labels, ingredients }, null, 2) + "\n",
);

const list = (items) => (items.length ? `\n      ${items.join("\n      ")}` : "");
const invalidCas = ingredients.filter((i) => i.casValid === false);
const recoveredCas = ingredients.filter((i) => i.casNotes.some((n) => n.startsWith("Excel stored")));
const missingPrice = ingredients.filter((i) => i.pricePerGram === null);
const unmapped = columns.filter((c) => !c.field).map((c) => c.header);

console.log(`
Imported ${ingredients.length} ingredients from ${SPREADSHEET} (sheet "${sheetName}") -> ${OUTPUT}

  Rows skipped:                 ${skipped.length}${list(skipped.map((s) => `row ${s.row}: ${s.reason}`))}
  Empty rows ignored:           ${blankRows}
  Wishlist rows (no price yet): ${ingredients.filter((i) => i.wishlist).length}
  Columns not recognised:       ${unmapped.length ? unmapped.join(", ") + " (shown under 'Other columns')" : "none"}

  Invalid CAS:                  ${invalidCas.length}${list(invalidCas.map((i) => `row ${i.rowNumber} ${i.name}: ${i.cas.join(", ")}`))}
  CAS read back from dates:     ${recoveredCas.length}${list(recoveredCas.map((i) => `row ${i.rowNumber} ${i.name}: ${i.cas.join(", ")}`))}
  No CAS (even after fill-in):  ${ingredients.filter((i) => i.cas.length === 0).length}

  Missing price:                ${missingPrice.length}
  Price calculated (cost÷size): ${ingredients.filter((i) => i.priceIsCalculated).length}
  Cost/gram ≠ cost÷size (>5%):  ${ingredients.filter((i) => i.priceMismatch).length}
  Cost/gram leaves out a fee:   ${ingredients.filter((i) => i.priceNote).length}
  No IFRA limit (after fill-in): ${ingredients.filter((i) => i.ifraRestriction === null).length}
  Duplicate names:              ${[...byName.values()].filter((g) => g.length > 1).map((g) => `${g[0].name} (rows ${g.map((i) => i.rowNumber).join(", ")})`).join("; ") || "none"}

  Filled in from ${FILLED_IN}: CAS ${filledCounts.cas}, IFRA ${filledCounts.ifraRestriction}, category ${filledCounts.category}, odor family ${filledCounts.odorFamily}, synonyms ${filledCounts.synonyms}${unmatchedFilled.length ? `\n  Filled-in entries that match no ingredient (renamed?): ${unmatchedFilled.join(", ")}` : ""}
`);
