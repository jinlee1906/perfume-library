// Suggested pairings.
//
// First choice: evidence from published formulas. Two ingredients "pair" when perfumers
// keep using them together (scripts/learn-formulas.mjs counts this for every pair in
// Jin's library). The score scales the number of shared formulas by how common each
// ingredient is, so everyday materials like Hedione don't top every list by default.
//
// Then a supplier's "blends well with" list. Fallback, for ingredients nothing else
// covers: odor-family rules. Each
// ingredient's odor family looks like "Citrus (lemon)"; only the main family ("Citrus")
// is used. The rules say which families traditionally work together: neighbours on the
// fragrance wheel and classic accords (cologne, chypre, fougère, amber). Edit freely:
// each line is [family, family, why they work together].

import { ingredients } from "./data";
import { insightFor, learned, profileFor, publishedById } from "./formulary";
import type { Ingredient } from "./types";

const RULES: [string, string, string][] = [
  ["Citrus", "Herbal", "the classic eau de cologne pairing"],
  ["Citrus", "Floral", "citrus lifts and brightens florals"],
  ["Citrus", "Woody", "a fresh top over a dry woody base"],
  ["Citrus", "Green", "together they read crisp and natural"],
  ["Citrus", "Tea", "bergamot and tea, as in Earl Grey"],
  ["Citrus", "Mossy", "citrus over oakmoss opens a classic chypre"],
  ["Citrus", "Aldehydic", "aldehydes add sparkle to citrus"],
  ["Citrus", "Marine", "an airy, aquatic freshness"],
  ["Citrus", "Fresh", "cool and zesty together"],
  ["Citrus", "Musk", "clean musks help citrus last"],
  ["Floral", "Fruity", "fruit makes florals juicier and more modern"],
  ["Floral", "Green", "green notes give florals a fresh-cut feel"],
  ["Floral", "Musk", "musks soften florals and help them last"],
  ["Floral", "Powdery", "powdery notes give florals a soft, cosmetic feel"],
  ["Floral", "Aldehydic", "the classic aldehydic floral style"],
  ["Floral", "Woody", "woods give florals a base to rest on"],
  ["Floral", "Spicy", "spices warm florals, like rose with clove"],
  ["Floral", "Animalic", "indolic notes make white florals richer"],
  ["Floral", "Tea", "a quiet, natural pairing, like jasmine tea"],
  ["Floral", "Leathery", "a soft leather style with iris or violet"],
  ["Fruity", "Gourmand", "fruit and sweetness read edible and playful"],
  ["Fruity", "Musk", "musks round off fruity notes"],
  ["Fruity", "Green", "green notes keep fruit from getting too sweet"],
  ["Fruity", "Woody", "woods ground fruity accords"],
  ["Green", "Herbal", "leafy and aromatic, like a herb garden"],
  ["Green", "Woody", "green over woods, like a forest"],
  ["Green", "Marine", "an open-air freshness"],
  ["Green", "Tea", "a green tea style"],
  ["Green", "Fresh", "cool and leafy"],
  ["Herbal", "Woody", "aromatic herbs over woods, common in masculine styles"],
  ["Herbal", "Powdery", "lavender with coumarin is the heart of a fougère"],
  ["Herbal", "Mossy", "lavender and oakmoss complete the fougère"],
  ["Herbal", "Spicy", "aromatic and warm spices layer naturally"],
  ["Herbal", "Fresh", "mint and herbs read cool and green"],
  ["Spicy", "Amber", "spice and amber are the base of amber (oriental) styles"],
  ["Spicy", "Woody", "spices warm up dry woods"],
  ["Spicy", "Gourmand", "spice and sweetness, like a bakery"],
  ["Spicy", "Leathery", "saffron and spices are classic in leather accords"],
  ["Spicy", "Balsamic", "warm, resinous and spicy together"],
  ["Spicy", "Tea", "a chai-like warmth"],
  ["Woody", "Amber", "a warm, long-lasting base"],
  ["Woody", "Musk", "the most common modern base"],
  ["Woody", "Leathery", "leather sits naturally on woods"],
  ["Woody", "Smoky", "smoky woods, like incense or a campfire"],
  ["Woody", "Mossy", "oakmoss and woods make the dry base of a chypre"],
  ["Woody", "Earthy", "earthy notes deepen woods"],
  ["Woody", "Marine", "a modern fresh-woody style"],
  ["Amber", "Musk", "a soft, skin-like warmth"],
  ["Amber", "Balsamic", "resins and amber are the backbone of amber styles"],
  ["Amber", "Gourmand", "sweetness makes amber richer"],
  ["Amber", "Tobacco", "a classic warm pairing"],
  ["Amber", "Leathery", "leather softened by amber"],
  ["Amber", "Animalic", "animalic warmth deepens amber"],
  ["Musk", "Powdery", "a clean, cosmetic feel"],
  ["Musk", "Aldehydic", "the 'clean laundry' effect"],
  ["Musk", "Animalic", "gives musks a more natural, skin-like character"],
  ["Musk", "Marine", "musks give aquatic notes body"],
  ["Gourmand", "Balsamic", "vanilla and resins blend seamlessly"],
  ["Gourmand", "Tobacco", "sweet pipe-tobacco style"],
  ["Gourmand", "Woody", "woods keep sweet notes from getting cloying"],
  ["Gourmand", "Musk", "musks make sweet notes softer and more wearable"],
  ["Gourmand", "Powdery", "tonka, vanilla and powdery notes melt together"],
  ["Balsamic", "Smoky", "resins and smoke, like incense"],
  ["Balsamic", "Tobacco", "a resinous tobacco"],
  ["Animalic", "Leathery", "animalic notes make leather richer"],
  ["Smoky", "Leathery", "birch tar and smoke are the core of Russian leather"],
  ["Smoky", "Tobacco", "smoke and tobacco belong together"],
  ["Leathery", "Tobacco", "a classic pairing"],
  ["Mossy", "Earthy", "a damp forest-floor effect"],
  ["Mossy", "Animalic", "animalic notes give chypres their depth"],
  ["Aldehydic", "Powdery", "a vintage cosmetic style"],
  ["Marine", "Fresh", "cool, airy freshness"],
];

// Lookup: "Citrus" -> Map("Herbal" -> reason, ...), in both directions.
const PAIRS = new Map<string, Map<string, string>>();
for (const [a, b, why] of RULES) {
  if (!PAIRS.has(a)) PAIRS.set(a, new Map());
  if (!PAIRS.has(b)) PAIRS.set(b, new Map());
  PAIRS.get(a)!.set(b, why);
  PAIRS.get(b)!.set(a, why);
}

/** "Citrus (lemon)" -> "Citrus" */
export function mainFamily(odorFamily: string | null): string | null {
  return odorFamily ? odorFamily.split(" (")[0].trim() : null;
}

export interface PairingReason {
  partners: Ingredient[]; // the selected ingredients this one goes with
  strength: number; // how strong the evidence is (higher first)
  why: string; // "together in 29 published formulas" or the family rule
  formulaTitles: string[]; // example formulas, for evidence-based reasons
}

export interface Suggestion {
  ingredient: Ingredient;
  sameMaterial: Ingredient[]; // other library rows that are the same material (e.g. Orcanox for Ambrofix)
  basis: "formulas" | "supplier" | "family";
  score: number;
  reasons: PairingReason[];
}

/** Skip duplicate rows (same name twice in the spreadsheet), keeping the first. */
function dedupeByName(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = s.ingredient.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Evidence from published formulas: ingredients often used with the selected ones. */
function fromFormulas(selected: Ingredient[], selectedIds: Set<string>): Suggestion[] {
  const byCandidate = new Map<string, Suggestion>();
  const selectedMaterials = new Set(selected.map((s) => learned.materialOf[s.id]));
  for (const s of selected) {
    const insight = insightFor(s.id);
    if (!insight) continue;
    for (const p of insight.partners) {
      if (selectedMaterials.has(p.material)) continue; // already in the formula under another name
      // One suggestion per material: Ambrofix and Orcanox are both ambroxide.
      const rows = p.ingredientIds
        .map((id) => ingredients.find((i) => i.id === id))
        .filter((i): i is Ingredient => i !== undefined && !selectedIds.has(i.id));
      const ingredient = rows.find((i) => !i.wishlist) ?? rows[0];
      if (!ingredient) continue;
      const sameMaterial = rows.filter((i) => i !== ingredient && i.name.trim().toLowerCase() !== ingredient.name.trim().toLowerCase());
      const sug = byCandidate.get(p.material) ?? { ingredient, sameMaterial, basis: "formulas" as const, score: 0, reasons: [] };
      sug.score += p.score;
      sug.reasons.push({
        partners: [s],
        strength: p.score,
        why: `together in ${p.shared} published formula${p.shared === 1 ? "" : "s"}`,
        formulaTitles: p.examples.map((fid) => publishedById.get(fid)?.title).filter((t): t is string => !!t),
      });
      byCandidate.set(p.material, sug);
    }
  }
  for (const sug of byCandidate.values()) sug.reasons.sort((a, b) => b.strength - a.strength);
  return [...byCandidate.values()].sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.ingredient.wishlist) - Number(b.ingredient.wishlist) ||
      a.ingredient.name.localeCompare(b.ingredient.name),
  );
}

/** Second: a supplier's "blends well with" list (PerfumersWorld product pages). */
function fromSupplier(selected: Ingredient[], selectedIds: Set<string>): Suggestion[] {
  const out = new Map<string, Suggestion>();
  for (const s of selected) {
    const profile = profileFor(s.id);
    for (const b of profile?.blendsWith ?? []) {
      const ingredient = ingredients.find((i) => b.ingredientIds.includes(i.id) && !selectedIds.has(i.id));
      if (!ingredient) continue;
      const sug = out.get(ingredient.id) ?? { ingredient, sameMaterial: [], basis: "supplier" as const, score: 0, reasons: [] };
      sug.score += 1;
      sug.reasons.push({ partners: [s], strength: 1, why: `${profile!.source} lists it as blending well`, formulaTitles: [] });
      out.set(ingredient.id, sug);
    }
  }
  return [...out.values()].sort((a, b) => b.score - a.score || a.ingredient.name.localeCompare(b.ingredient.name));
}

/** Fallback: odor-family rules, for ingredients the formulas say nothing about. */
function fromFamilies(selected: Ingredient[], selectedIds: Set<string>): Suggestion[] {
  const byFamily = new Map<string, Ingredient[]>();
  for (const s of selected) {
    const fam = mainFamily(s.odorFamily);
    if (fam) byFamily.set(fam, [...(byFamily.get(fam) ?? []), s]);
  }
  const out: Suggestion[] = [];
  for (const candidate of ingredients) {
    if (selectedIds.has(candidate.id)) continue;
    const fam = mainFamily(candidate.odorFamily);
    if (!fam) continue;
    const reasons: PairingReason[] = [];
    for (const [family, partners] of byFamily) {
      const why = PAIRS.get(family)?.get(fam);
      if (why) reasons.push({ partners, strength: 1, why: `${family} with ${fam}: ${why}`, formulaTitles: [] });
    }
    if (reasons.length) out.push({ ingredient: candidate, sameMaterial: [], basis: "family", score: reasons.length, reasons });
  }
  out.sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.ingredient.wishlist) - Number(b.ingredient.wishlist) ||
      a.ingredient.name.localeCompare(b.ingredient.name),
  );
  // Mix families so the list isn't four aldehydes in a row.
  const rank = new Map<Suggestion, number>();
  const counts = new Map<string, number>();
  for (const s of out) {
    const key = `${s.score}|${mainFamily(s.ingredient.odorFamily)}`;
    rank.set(s, counts.get(key) ?? 0);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return out
    .map((s, order) => ({ s, order }))
    .sort((a, b) => b.s.score - a.s.score || rank.get(a.s)! - rank.get(b.s)! || a.order - b.order)
    .map(({ s }) => s);
}

/**
 * Suggests library ingredients that pair with the selected ones: evidence from published
 * formulas first, then odor-family suggestions to fill the list.
 */
export function suggestPairings(selected: Ingredient[], limit = 30): Suggestion[] {
  const selectedIds = new Set(selected.map((i) => i.id));
  const evidence = dedupeByName(fromFormulas(selected, selectedIds));
  const shown = new Set(evidence.map((s) => s.ingredient.name.trim().toLowerCase()));
  const notShown = (s: Suggestion) => !shown.has(s.ingredient.name.trim().toLowerCase());
  const supplier = dedupeByName(fromSupplier(selected, selectedIds)).filter(notShown);
  supplier.forEach((s) => shown.add(s.ingredient.name.trim().toLowerCase()));
  const families = dedupeByName(fromFamilies(selected, selectedIds)).filter(notShown);
  return [...evidence, ...supplier, ...families].slice(0, limit);
}
