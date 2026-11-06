// Calculations for a formula: percentages, cost and the IFRA check.

import { ingredients, ingredientsById } from "./data";
import type { Formula, FormulaLine, Ingredient } from "./types";

/**
 * Reads an IFRA value like "0.25% in finished product".
 * Returns the limit in %, Infinity for "None" (no limit), or null if there's no usable value.
 */
export function ifraLimitPercent(text: string | null): number | null {
  if (text === null) return null;
  if (/^none\b/i.test(text.trim())) return Infinity;
  const match = /([\d.]+)\s*%/.exec(text);
  if (!match) return null;
  const limit = Number(match[1]);
  return limit >= 100 ? Infinity : limit;
}

/** Finds the library ingredient for a formula line (by id, or by name if it was renamed). */
export function findIngredient(line: FormulaLine): Ingredient | undefined {
  return (
    ingredientsById.get(line.ingredientId) ??
    ingredients.find((i) => i.name.toLowerCase() === line.ingredientName.toLowerCase())
  );
}

export type IfraStatus =
  | "ok" // under the limit
  | "over" // over the limit
  | "no-limit" // IFRA doesn't restrict it
  | "needs-concentration" // restricted, but the formula's concentration isn't set yet
  | "unknown"; // no IFRA value in the spreadsheet

export interface LineStats {
  line: FormulaLine;
  ingredient: Ingredient | undefined;
  percentOfFormula: number; // share of the formula's total weight
  cost: number | null; // grams × cost per gram
  ifraLimit: number | null; // % in finished product (Infinity = no limit)
  percentInProduct: number | null; // this ingredient's % in the finished product
  maxPercentOfFormula: number | null; // the most it could be in the formula at this concentration
  ifraStatus: IfraStatus;
}

export interface FormulaStats {
  totalGrams: number;
  totalCost: number; // sum of the lines that have a price
  linesWithoutPrice: number;
  costPerGram: number | null;
  lines: LineStats[];
  overLimit: number; // how many lines are over their IFRA limit
}

export function formulaStats(formula: Formula): FormulaStats {
  const totalGrams = formula.lines.reduce((sum, l) => sum + (l.grams || 0), 0);
  // Only a concentration between 0 and 100% makes sense; anything else counts as not set.
  const c = formula.concentrationPercent;
  const concentration = c !== null && c > 0 && c <= 100 ? c : null;

  const lines = formula.lines.map((line): LineStats => {
    const ingredient = findIngredient(line);
    const percentOfFormula = totalGrams > 0 ? ((line.grams || 0) / totalGrams) * 100 : 0;
    const price = ingredient?.pricePerGram ?? null;
    const ifraLimit = ifraLimitPercent(ingredient?.ifraRestriction ?? null);

    let ifraStatus: IfraStatus;
    let percentInProduct: number | null = null;
    let maxPercentOfFormula: number | null = null;
    if (ifraLimit === null) ifraStatus = "unknown";
    else if (ifraLimit === Infinity) ifraStatus = "no-limit";
    else if (!concentration) ifraStatus = "needs-concentration";
    else {
      // e.g. 3% of a formula used at 20% in the product = 0.6% in the product
      percentInProduct = (percentOfFormula * concentration) / 100;
      maxPercentOfFormula = Math.min(100, (ifraLimit / concentration) * 100);
      ifraStatus = percentInProduct > ifraLimit ? "over" : "ok";
    }

    return {
      line,
      ingredient,
      percentOfFormula,
      cost: price !== null ? price * (line.grams || 0) : null,
      ifraLimit,
      percentInProduct,
      maxPercentOfFormula,
      ifraStatus,
    };
  });

  const totalCost = lines.reduce((sum, l) => sum + (l.cost ?? 0), 0);
  return {
    totalGrams,
    totalCost,
    linesWithoutPrice: lines.filter((l) => l.cost === null).length,
    costPerGram: totalGrams > 0 ? totalCost / totalGrams : null,
    lines,
    overLimit: lines.filter((l) => l.ifraStatus === "over").length,
  };
}

/** 12.3456 -> "12.35", 0.00123 -> "0.0012": enough digits to be useful for small amounts. */
export function formatPercent(value: number): string {
  if (value === 0) return "0";
  if (value >= 1) return value.toFixed(2);
  return value.toPrecision(2);
}

/** A limit without trailing zeros: 20 -> "20", 0.6 -> "0.6", 0.012 -> "0.012". */
export function formatLimit(value: number): string {
  return String(Number(value.toPrecision(3)));
}
