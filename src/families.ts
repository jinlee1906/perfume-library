// The 22 odor families in Jin's spreadsheet, folded into 8 scent groups. Each group has one colour
// (--g-* in styles.css), used for marks and for tinting the seals. Eight is as many colours as
// people can reliably tell apart, so each family keeps its own texture and name, and shares its
// group's colour. The order is fixed, because it's the order the colours were validated in: it
// keeps neighbouring groups distinguishable with colour-blindness too, so don't re-sort it.

import { ingredients } from "./data";
import { mainFamily } from "./pairings";
import type { Ingredient } from "./types";

export interface ScentGroup {
  id: string;
  label: string;
  families: string[];
}

export const scentGroups: ScentGroup[] = [
  { id: "citrus", label: "Citrus and fresh", families: ["Citrus", "Fresh"] },
  { id: "cool", label: "Cool and clean", families: ["Aldehydic", "Marine"] },
  { id: "green", label: "Green and herbal", families: ["Green", "Herbal", "Mossy", "Tea"] },
  { id: "floral", label: "Floral and powdery", families: ["Floral", "Powdery"] },
  { id: "amber", label: "Amber, spice and sweet", families: ["Amber", "Balsamic", "Gourmand", "Spicy"] },
  { id: "musk", label: "Musk and animalic", families: ["Musk", "Animalic"] },
  { id: "fruity", label: "Fruity", families: ["Fruity"] },
  { id: "woody", label: "Woody and dark", families: ["Woody", "Earthy", "Leathery", "Smoky", "Tobacco"] },
];

const groupByFamily = new Map(scentGroups.flatMap((g) => g.families.map((f) => [f, g] as const)));

/** The scent group an odor family belongs to, if the spreadsheet gives one. */
export function groupOf(odorFamily: string | null): ScentGroup | null {
  const family = mainFamily(odorFamily);
  return (family && groupByFamily.get(family)) || null;
}

export const groupOfIngredient = (i: Ingredient | undefined) => (i ? groupOf(i.odorFamily) : null);

/** How many rows of the library are in each family. */
export const familyCounts = new Map<string, number>();
for (const i of ingredients) {
  const family = mainFamily(i.odorFamily);
  if (family) familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
}

/** A family's seal texture (rendered by scripts/film/seals.frag). */
export function sealUrl(family: string, small = false): string {
  return `${import.meta.env.BASE_URL}seals/${family.toLowerCase()}${small ? "-small" : ""}.webp`;
}

/** A film or still in public/film. */
export function filmUrl(name: string): string {
  return `${import.meta.env.BASE_URL}film/${name}.webp`;
}

/** A small stable number from any text: gives each ingredient its own turn of its family's seal. */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
