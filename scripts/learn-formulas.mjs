// Learns from published formulas: links each formula line to Jin's library, then works
// out, for every library ingredient, which formulas use it, how much of a formula it
// usually is (its role), and which other ingredients it's most often used with.
//
// Run it with:  npm run import   (runs after the spreadsheet import)
//               node scripts/learn-formulas.mjs --review   (also lists matches to check)
//
// Reads:  src/data/ingredients.json            (made by scripts/import.mjs)
//         data/reference-formulas/*.json       (published formulas, with sources)
//         data/formula-aliases.json            (hand-checked name matches)
// Writes: src/data/reference-formulas.json     (formulas, each line linked to the library)
//         src/data/insights.json               (per-ingredient roles and pairings)
//
// Rules: amounts are kept exactly as published. A formula line is only linked to a
// library ingredient by name, CAS number or an alias in formula-aliases.json; nothing
// is guessed. Lines that don't match are kept and shown as "not in Jin's library".

import * as fs from "node:fs";

const INGREDIENTS = "src/data/ingredients.json";
const SOURCES_DIR = "data/reference-formulas";
const ALIASES = "data/formula-aliases.json";
const PROFILES = "data/supplier-profiles.json";
const OUT_FORMULAS = "src/data/reference-formulas.json";
const OUT_INSIGHTS = "src/data/insights.json";
const REVIEW = process.argv.includes("--review");

// Pairings need at least this many shared formulas to count as evidence.
const MIN_SHARED_FORMULAS = 2;

// ---------------------------------------------------------------------------
// 1. Name and CAS normalisation
// ---------------------------------------------------------------------------

// Grade, quality and supplier words that don't change what the material is.
// Matching after removing these is reported as "same material, different grade".
const GRADE_WORDS = [
  "signature", "superior", "supreme", "extra", "pure", "natural", "crystals", "crystal", "total",
  "vraie", "dextro", "fcf", "decolourised", "rectified", "basf", "firmenich", "givaudan", "iff",
  "symrise", "indesso", "berje", "mane", "fils", "capua", "1880", "payan", "bertrand", "p n",
  "organic", "org", "comoros",
];

// Isomer words can sit before or after the name ("Ionone Alpha" = "Alpha Ionone"), so
// they're moved to the front. Other words keep their order: "Ethyl Phenyl Acetate" and
// "Phenyl Ethyl Acetate" are different chemicals.
const ISOMER_WORDS = new Set(["alpha", "beta", "gamma", "delta", "cis", "trans"]);

/** "Damascone Alpha 10% DPG" -> dilution 10 (percent), or null when undiluted / not stated. */
export function dilutionPercent(name, column) {
  // "(or Orange Blossom abs. 10%)" names an alternative material, not a dilution.
  const text = `${column ?? ""} ${name.replace(/\(or [^)]*\)/gi, "")}`;
  // "10%", "50 PCT", or a bare strength before a solvent: "Galaxolide 50 IPM".
  const m = /(\d+(?:\.\d+)?)\s*(?:%|pct\b)/i.exec(text) ?? /\b(\d{1,2}(?:\.\d+)?)\s+(?:ipm|dpg|dipg|tec|bb|mip)\b/i.exec(text);
  if (!m) return null;
  const pct = Number(m[1]);
  return pct > 0 && pct < 100 ? pct : null;
}

/** Lower case, no accents/marks/quotes/codes/dilutions, isomer word first: "Ionone Alpha 10%" -> "alpha ionone". */
function nameKey(name, { dropGrades = false } = {}) {
  // Marks go before NFKD, which would otherwise turn ™ into the letters "TM".
  let s = name.replace(/[®™©]/g, " ").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(/œ/g, "oe").replace(/æ/g, "ae"); // "Vertofix Cœur" -> "vertofix coeur"
  s = s.replace(/[“”"'‘’`]/g, " ");
  s = s.replace(/\(([^)]*)\)/g, " "); // "(Ambroxan)" and similar asides
  s = s.replace(/\b\d{6}\b/g, " "); // Fraterworks base codes, e.g. "Pink Acacia 665890"
  s = s.replace(/\b\d+(?:\.\d+)?\s*(?:%|pct\b)(?:\s*(?:in\s+)?(?:dpg|tec|ipm|bb|ethanol|alcohol))?/g, " ");
  s = s.replace(/\b\d+\s*(?:ipm|dpg|dipg|tec|mip)\b/g, " ").replace(/\b(?:in\s+)?(?:dpg|dipg|tec|ipm|bb|mip)\b/g, " ");
  if (dropGrades) {
    s = s.replace(/\bex\b.*$/, " "); // "Vanillin ex Lignin" -> "vanillin"
    s = s.replace(/\bhigh cis\b/g, " ");
    s = s.replace(/[^a-z0-9]+/g, " ");
    for (const w of GRADE_WORDS) s = s.replace(new RegExp(`\\b${w}\\b`, "g"), " ");
  }
  const words = s.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const isomers = words.filter((w) => ISOMER_WORDS.has(w)).sort();
  return [...isomers, ...words.filter((w) => !ISOMER_WORDS.has(w))].join(" ");
}

// Solvents, carriers and additives: kept in the formulas as published, but left out of the
// learning (they don't shape the scent) and never counted as "missing" materials.
const SOLVENT = /^(?:dipropylene glycol|dpg|solgard|triethyl ?citrate|(?:deluxe )?perfumer s alcohol|alcohol|ethanol|(?:distilled )?water|mmb|dowanol dpm|dipg monomethyl ether|isopropyl myristate|ipm|tec|butylated hydroxytoluene|bht|tocopherol)\b/;
export const isSolvent = (name) =>
  SOLVENT.test(name.replace(/[®™©]/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());

/** "0123-11-5" -> "123-11-5", "1222-5-5" -> "1222-05-5"; null for "Mixture" etc. */
function normaliseCas(cas) {
  const m = /^0*(\d{2,7})-(\d{1,2})-(\d)$/.exec((cas ?? "").trim());
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3]}` : null;
}

// ---------------------------------------------------------------------------
// 2. Jin's library, grouped into "materials"
//    Rows with the same CAS number (Orcanox and Ambrofix are both ambroxide) or the
//    same name (duplicate rows) are one material, so their evidence is shared.
// ---------------------------------------------------------------------------

const library = JSON.parse(fs.readFileSync(INGREDIENTS, "utf8")).ingredients;
const materialOf = new Map(); // ingredient id -> material id
const materials = new Map(); // material id -> { id, ids: [...], names: [...] }
for (const ing of library) {
  const cas = ing.cas.length === 1 ? normaliseCas(ing.cas[0]) : null;
  const key = cas ? `cas:${cas}` : `name:${nameKey(ing.name)}`;
  if (!materials.has(key)) materials.set(key, { id: key, ids: [], names: [] });
  materials.get(key).ids.push(ing.id);
  materials.get(key).names.push(ing.name.trim());
  materialOf.set(ing.id, key);
}

// Lookup tables for matching.
const byExactKey = new Map(); // nameKey of the library name -> [ingredient]
const bySynonymKey = new Map(); // nameKey of a synonym (another trade or chemical name) -> [ingredient]
const byGradeKey = new Map(); // nameKey without grades -> [ingredient]
const byCas = new Map(); // CAS -> [ingredient]
const add = (map, key, ing) => key && map.set(key, [...(map.get(key) ?? []), ing]);
for (const ing of library) {
  add(byExactKey, nameKey(ing.name), ing);
  for (const n of ing.synonyms) add(bySynonymKey, nameKey(n), ing);
  for (const n of [ing.name, ...ing.synonyms]) add(byGradeKey, nameKey(n, { dropGrades: true }), ing);
  for (const c of ing.cas) add(byCas, normaliseCas(c), ing);
}
const unique = (list) => [...new Map(list.map((i) => [i.id, i])).values()];

// Hand-checked aliases: { "source name": { "library": "Library name" | null, "why": "..." } }.
// null means "checked: not in Jin's library", which stops a wrong automatic match.
const aliasFile = fs.existsSync(ALIASES) ? JSON.parse(fs.readFileSync(ALIASES, "utf8")) : { aliases: {} };
const aliases = new Map(Object.entries(aliasFile.aliases).map(([k, v]) => [nameKey(k), v]));
const gradeAliases = new Map(Object.entries(aliasFile.aliases).map(([k, v]) => [nameKey(k, { dropGrades: true }), v]));
const libraryByName = new Map(library.map((i) => [i.name.trim().toLowerCase(), i]));

/**
 * Finds the library ingredient(s) for a formula line.
 * match: "exact" (same product name), "variant" (same material: other grade, supplier,
 * dilution or a CAS match), or null.
 */
function matchLine(line) {
  const key = nameKey(line.name);
  const gradeKey = nameKey(line.name, { dropGrades: true });
  // Order matters: an alias for this exact name, then the library's own names and
  // synonyms; only then looser matches (grade words removed), and CAS numbers last
  // (a few PDFs print a wrong CAS, and a clear name should win).
  const viaAlias = (a) => {
    if (a.library === null) return { ingredients: [], match: null, how: "alias" };
    const ing = libraryByName.get(a.library.trim().toLowerCase());
    if (!ing) throw new Error(`formula-aliases.json: "${a.library}" isn't a library ingredient name`);
    return { ingredients: [ing], match: a.match ?? "variant", how: "alias" };
  };
  if (aliases.has(key)) return viaAlias(aliases.get(key));
  const exact = byExactKey.get(key);
  if (exact) return { ingredients: unique(exact), match: "exact", how: "name" };
  const synonym = bySynonymKey.get(key);
  if (synonym) return { ingredients: unique(synonym), match: "variant", how: "syn" };
  if (gradeAliases.has(gradeKey)) return viaAlias(gradeAliases.get(gradeKey));
  const graded = byGradeKey.get(gradeKey);
  if (graded) return { ingredients: unique(graded), match: "variant", how: "grade" };
  const cas = normaliseCas(line.cas);
  if (cas && byCas.has(cas)) return { ingredients: unique(byCas.get(cas)), match: "variant", how: "cas" };
  return { ingredients: [], match: null, how: null };
}

// ---------------------------------------------------------------------------
// 3. Read every source file and link the lines
// ---------------------------------------------------------------------------

const sources = fs
  .readdirSync(SOURCES_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((file) => {
    const src = JSON.parse(fs.readFileSync(`${SOURCES_DIR}/${file}`, "utf8"));
    // Catch hand-edited files with something missing, with a message that says where.
    const fail = (msg) => {
      throw new Error(`${SOURCES_DIR}/${file}: ${msg}`);
    };
    if (!src.source || !Array.isArray(src.formulas)) fail('needs "source" and a "formulas" list');
    const ids = new Set();
    for (const f of src.formulas) {
      for (const key of ["id", "title", "kind", "url", "unit"]) if (!f[key]) fail(`formula ${f.id ?? f.title ?? "?"} has no "${key}"`);
      if (!["perfume", "accord", "home"].includes(f.kind)) fail(`formula ${f.id}: kind must be perfume, accord or home`);
      if (ids.has(f.id)) fail(`two formulas have the id ${f.id}`);
      ids.add(f.id);
      if (!Array.isArray(f.lines) || !f.lines.length) fail(`formula ${f.id} has no lines`);
      for (const l of f.lines) if (!l.name || typeof l.amount !== "number") fail(`formula ${f.id}: each line needs a name and a numeric amount`);
    }
    return src;
  });

const formulas = [];
const reviewMatches = new Map(); // "source name" -> { names, how, count }
const unmatchedNames = new Map(); // nameKey -> { name, formulas: Set }

for (const src of sources) {
  for (const f of src.formulas) {
    const lines = f.lines.map((line) => {
      if (isSolvent(line.name)) {
        return { ...line, dilutionPercent: null, ingredientIds: [], match: null, solvent: true };
      }
      const m = matchLine(line);
      const dilution = dilutionPercent(line.name, line.dilution);
      if (m.ingredients.length) {
        const r = reviewMatches.get(line.name) ?? { names: m.ingredients.map((i) => i.name.trim()), how: m.how, count: 0 };
        r.count++;
        reviewMatches.set(line.name, r);
      } else if (m.how !== "alias") {
        const k = nameKey(line.name);
        const u = unmatchedNames.get(k) ?? { name: line.name, formulas: new Set() };
        u.formulas.add(f.id);
        unmatchedNames.set(k, u);
      }
      // Jin's bottle at another dilution ("Calone 10%" vs neat Calone) is the same material, not
      // the same product: the amounts need converting, so it's a variant.
      const otherStrength = m.ingredients.some((i) => (dilutionPercent(i.name) ?? 100) !== (dilution ?? 100));
      return {
        ...line,
        dilutionPercent: dilution,
        ingredientIds: m.ingredients.map((i) => i.id),
        match: m.match === "exact" && otherStrength ? "variant" : m.match,
      };
    });
    const total = lines.reduce((sum, l) => sum + l.amount, 0);
    // Share of the whole formula, and of pure material once dilutions are taken into account.
    for (const l of lines) {
      l.percent = total > 0 ? round((l.amount / total) * 100, 4) : 0;
      l.neatPercent = round(l.percent * ((l.dilutionPercent ?? 100) / 100), 5);
    }
    formulas.push({
      ...f,
      source: src.source,
      sourceUrl: src.sourceUrl,
      lines,
      total: round(total, 3),
      totalNote:
        f.printedTotal != null && Math.abs(total - f.printedTotal) > 0.01
          ? `The amounts add up to ${round(total)} ${f.unit}; the source's printed total is ${round(f.printedTotal)} ${f.unit}.`
          : null,
    });
  }
}

function round(n, digits = 2) {
  return Number(n.toFixed(digits));
}

// ---------------------------------------------------------------------------
// 4. What the formulas teach about each material
// ---------------------------------------------------------------------------

// Role, from the material's typical (median) share of the formula as pure material.
// These bands are a convention for this site, not an industry standard.
const ROLES = [
  { min: 10, role: "Backbone", meaning: "usually 10% or more of a formula: it carries the structure" },
  { min: 3, role: "Main note", meaning: "usually 3–10%: a clearly smellable part of the theme" },
  { min: 0.5, role: "Supporting", meaning: "usually 0.5–3%: rounds out and shapes the main notes" },
  { min: 0.05, role: "Accent", meaning: "usually 0.05–0.5%: a small touch that adds character" },
  { min: 0, role: "Trace", meaning: "usually under 0.05%: powerful enough to work in traces" },
];
const roleFor = (median) => ROLES.find((r) => median >= r.min);

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Pairings learn from perfumes and accords; roles (typical amounts) only from complete
// perfumes, since in an accord every material is a big share by design. Room sprays and
// diffusers are left out of both.
const learningSet = formulas.filter((f) => f.kind !== "home");

// material -> { formulaIds:Set, neat:[...] } ; pairs "a|b" -> Set(formulaIds)
const usage = new Map();
const together = new Map();
for (const f of learningSet) {
  const inFormula = new Map(); // material -> total neat % in this formula
  for (const l of f.lines) {
    const mats = new Set(l.ingredientIds.map((id) => materialOf.get(id)));
    for (const m of mats) inFormula.set(m, (inFormula.get(m) ?? 0) + l.neatPercent);
  }
  for (const [m, neat] of inFormula) {
    const u = usage.get(m) ?? { formulaIds: new Set(), neat: [] };
    u.formulaIds.add(f.id);
    if (f.kind === "perfume") u.neat.push(neat);
    usage.set(m, u);
  }
  const mats = [...inFormula.keys()].sort();
  for (let i = 0; i < mats.length; i++) {
    for (let j = i + 1; j < mats.length; j++) {
      const key = `${mats[i]}|${mats[j]}`;
      if (!together.has(key)) together.set(key, new Set());
      together.get(key).add(f.id);
    }
  }
}

// Materials outside Jin's library that keep turning up (a shopping list, of sorts).
const commonElsewhere = [...unmatchedNames.values()]
  .map((u) => ({ name: u.name, formulas: u.formulas.size }))
  .sort((a, b) => b.formulas - a.formulas);

const insights = {};
for (const [m, u] of usage) {
  const neat = [...u.neat].sort((a, b) => a - b);
  const median = quantile(neat, 0.5); // null when the material only appears in accords
  const partners = [];
  for (const [other, ou] of usage) {
    if (other === m) continue;
    const shared = together.get([m, other].sort().join("|"));
    if (!shared || shared.size < MIN_SHARED_FORMULAS) continue;
    // Cosine similarity: shared formulas, scaled so very common materials don't win by default.
    const score = shared.size / Math.sqrt(u.formulaIds.size * ou.formulaIds.size);
    partners.push({ material: other, shared: shared.size, score: round(score, 3), examples: [...shared].slice(0, 3) });
  }
  partners.sort((a, b) => b.score - a.score || b.shared - a.shared);
  const role = median === null ? null : roleFor(median);
  insights[m] = {
    ingredientIds: materials.get(m).ids,
    formulaCount: u.formulaIds.size,
    formulaIds: [...u.formulaIds],
    perfumeCount: neat.length,
    neatPercent: neat.length
      ? { min: round(neat[0], 4), p25: round(quantile(neat, 0.25), 4), median: round(median, 4), p75: round(quantile(neat, 0.75), 4), max: round(neat[neat.length - 1], 4) }
      : null,
    role: role?.role ?? null,
    roleMeaning: role?.meaning ?? null,
    partners: partners.slice(0, 24).map((p) => ({ ...p, ingredientIds: materials.get(p.material).ids })),
  };
}

// ---------------------------------------------------------------------------
// 5. Supplier notes for each ingredient (data/supplier-profiles.json)
//    Linked by the exact spreadsheet name; "blends well with" names are matched to the
//    library with the same rules as formula lines.
// ---------------------------------------------------------------------------

const profiles = {};
const profileFile = fs.existsSync(PROFILES) ? JSON.parse(fs.readFileSync(PROFILES, "utf8")).profiles : {};
for (const [name, profile] of Object.entries(profileFile)) {
  const rows = library.filter((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (!rows.length) {
    console.warn(`supplier-profiles.json: "${name}" isn't in the spreadsheet (renamed?)`);
    continue;
  }
  const blends = (profile.blendsWith ?? []).map((b) => {
    const m = matchLine({ name: b });
    return { name: b, ingredientIds: m.ingredients.map((i) => i.id) };
  });
  for (const row of rows) profiles[row.id] = { ...profile, blendsWith: blends };
}

// ---------------------------------------------------------------------------
// 6. Write the files and print a summary
// ---------------------------------------------------------------------------

fs.writeFileSync(
  OUT_FORMULAS,
  JSON.stringify({ learnedAt: new Date().toISOString(), sources: sources.map((s) => ({ source: s.source, url: s.sourceUrl, about: s.about })), formulas }, null, 1) + "\n",
);
fs.writeFileSync(
  OUT_INSIGHTS,
  JSON.stringify({ learnedFrom: learningSet.length, minSharedFormulas: MIN_SHARED_FORMULAS, roles: ROLES, materialOf: Object.fromEntries(materialOf), insights, profiles, commonElsewhere: commonElsewhere.slice(0, 60) }, null, 1) + "\n",
);

const allLines = formulas.flatMap((f) => f.lines).filter((l) => !l.solvent);
const linked = allLines.filter((l) => l.ingredientIds.length);
const usedIngredients = new Set(linked.flatMap((l) => l.ingredientIds));
console.log(`
Learned from ${formulas.length} published formulas (${learningSet.length} used for roles and pairings) -> ${OUT_FORMULAS}, ${OUT_INSIGHTS}

  Formula lines (no solvents):  ${allLines.length}
  Linked to Jin's library:      ${linked.length} (exact ${linked.filter((l) => l.match === "exact").length}, same material ${linked.filter((l) => l.match === "variant").length})
  Library ingredients used:     ${usedIngredients.size} of ${library.length}
  Library ingredients unused:   ${library.filter((i) => !usedIngredients.has(i.id)).map((i) => i.name.trim()).join(", ")}
  Totals that differ from the printed total: ${formulas.filter((f) => f.totalNote).length}
  Supplier notes:               ${Object.keys(profiles).length} of ${library.length} library rows
`);

if (REVIEW) {
  console.log("Matches (source name -> library, how, lines):");
  for (const [name, r] of [...reviewMatches].sort((a, b) => a[1].names[0].localeCompare(b[1].names[0]))) {
    console.log(`  ${r.how.padEnd(5)} ${name}  ->  ${r.names.join(" / ")}  (${r.count})`);
  }
  console.log("\nMost common names NOT linked (formulas):");
  for (const u of commonElsewhere) console.log(`  ${String(u.formulas).padStart(3)}  ${u.name}`);
}
