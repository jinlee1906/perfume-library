// The formulary: published formulas, linked to Jin's library, and what the site learned
// from them (each ingredient's role, typical amount and best pairings).
// Both files are made by scripts/learn-formulas.mjs (run as part of npm run import).

import formularyRaw from "./data/reference-formulas.json";
import insightsRaw from "./data/insights.json";
import { ingredientsById } from "./data";
import type { FormularyData, Ingredient, InsightData, MaterialInsight, PublishedFormula, SupplierProfile } from "./types";

export const formulary = formularyRaw as unknown as FormularyData;
export const learned = insightsRaw as unknown as InsightData;

export const publishedFormulas: PublishedFormula[] = formulary.formulas;
export const publishedById = new Map(publishedFormulas.map((f) => [f.id, f]));

/** What the formulas say about an ingredient, or null if no published formula uses it. */
export function insightFor(ingredientId: string): MaterialInsight | null {
  const material = learned.materialOf[ingredientId];
  return (material && learned.insights[material]) || null;
}

/** The supplier's notes for an ingredient, if any. */
export function profileFor(ingredientId: string): SupplierProfile | null {
  return learned.profiles?.[ingredientId] ?? null;
}

/** The site's role band for a typical share of a perfume (see scripts/learn-formulas.mjs). */
export function roleForShare(percent: number): { role: string; meaning: string } {
  return learned.roles.find((r) => percent >= r.min) ?? learned.roles[learned.roles.length - 1];
}

/** Library ingredients for a list of ids (skips any that no longer exist). */
export function ingredientsFor(ids: string[]): Ingredient[] {
  return ids.map((id) => ingredientsById.get(id)).filter((i): i is Ingredient => i !== undefined);
}

/** "Ambrofix / Orcanox": the names Jin uses for one material, without duplicate rows. */
export function materialName(ids: string[]): string {
  return [...new Set(ingredientsFor(ids).map((i) => i.name.trim()))].join(" / ");
}

export interface Coverage {
  total: number; // scent materials in the formula (solvents left out)
  owned: number; // of those, how many Jin has (exactly or the same material)
  exact: number;
}

/** How much of a formula Jin can make from the library. */
export function coverage(formula: PublishedFormula): Coverage {
  const lines = formula.lines.filter((l) => !l.solvent);
  return {
    total: lines.length,
    owned: lines.filter((l) => l.ingredientIds.length > 0).length,
    exact: lines.filter((l) => l.match === "exact").length,
  };
}

/** Formulas that use an ingredient (or the same material under another name). */
export function formulasUsing(ingredientId: string): PublishedFormula[] {
  const material = learned.materialOf[ingredientId];
  return publishedFormulas.filter((f) =>
    f.lines.some((l) => l.ingredientIds.some((id) => id === ingredientId || learned.materialOf[id] === material)),
  );
}

/** This ingredient's share of a formula, as published and as pure material. */
export function shareIn(formula: PublishedFormula, ingredientId: string): { percent: number; neatPercent: number } {
  const material = learned.materialOf[ingredientId];
  const lines = formula.lines.filter((l) => l.ingredientIds.some((id) => id === ingredientId || learned.materialOf[id] === material));
  return {
    percent: lines.reduce((s, l) => s + l.percent, 0),
    neatPercent: lines.reduce((s, l) => s + l.neatPercent, 0),
  };
}

export const kindLabel: Record<PublishedFormula["kind"], string> = {
  perfume: "Perfume",
  accord: "Accord",
  home: "Home & body",
};

/** 8.25 -> "8.3%", 0.0204 -> "0.02%", 0.0031 -> "0.003%". */
export function formatShare(value: number): string {
  if (value >= 10) return `${value.toFixed(0)}%`;
  if (value >= 1) return `${Number(value.toFixed(1))}%`;
  return `${Number(value.toPrecision(2))}%`;
}

/** "Smells like Nishane Ani", but "smells like a very popular perfume" for anonymised ones. */
export function smellsLikeText(smellsLike: string): string {
  return `Smells like ${smellsLike.replace(/^(A|An|The) /, (m) => m.toLowerCase())}`;
}
