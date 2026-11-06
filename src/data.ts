// Loads the imported JSON and provides small helpers used by both pages.

import raw from "./data/ingredients.json";
import type { Ingredient, IngredientData } from "./types";

export const data = raw as unknown as IngredientData;
export const ingredients: Ingredient[] = data.ingredients;
export const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));

// Materials, not rows: a few appear twice in the spreadsheet.
const countNames = (list: Ingredient[]) => new Set(list.map((i) => i.name.trim().toLowerCase())).size;
export const shelf = {
  owned: countNames(ingredients.filter((i) => !i.wishlist)),
  wished: countNames(ingredients) - countNames(ingredients.filter((i) => !i.wishlist)),
};

/** True if any value on the site was filled in by Claude rather than taken from your spreadsheet. */
export const anyFilledIn = ingredients.some((i) => Object.keys(i.filled).length > 0);

/** Your spreadsheet's column header for a field, e.g. "Cost/gram (USD)". */
export function columnLabel(field: string, fallback: string): string {
  return data.labels[field] ?? fallback;
}

/** 2.1575 -> "$2.16" (or "$2.158" with digits = 3). */
export function formatMoney(value: number, currency: string | null, digits = 2): string {
  if (!currency) return value.toFixed(digits);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** True if a CAS note is just "this is a mixture" rather than a problem. */
export const isMixtureNote = (note: string) => note.includes('"Mixture"');
