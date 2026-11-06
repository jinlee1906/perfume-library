// What a published formula is made of, as one bar split into parts: the share of the formula in
// each scent group (going by the odor family of the matching library ingredient), then what isn't
// in Jin's library, then solvents. Thin on cards, tall with its shares printed on a formula page.
// The formula sheet below it is the full table of the same numbers.

import { formatShare } from "../formulary";
import { groupOf, scentGroups } from "../families";
import { ingredientsById } from "../data";
import type { PublishedFormula } from "../types";

export interface Part {
  id: string; // a scent group, or "none", "solvent", "other"
  label: string;
  percent: number;
  detail?: string;
}

const NONE = { id: "none", label: "Not in Jin's library" };
const SOLVENT = { id: "solvent", label: "Solvent" };

/** The formula's parts, always in the same order, leaving out any at zero. */
export function composition(formula: PublishedFormula): Part[] {
  const totals = new Map<string, number>();
  const add = (id: string, percent: number) => totals.set(id, (totals.get(id) ?? 0) + percent);
  for (const line of formula.lines) {
    if (line.solvent) add(SOLVENT.id, line.percent);
    else if (line.ingredientIds.length === 0) add(NONE.id, line.percent);
    else {
      const ingredient = ingredientsById.get(line.ingredientIds[0]);
      add(groupOf(ingredient?.odorFamily ?? null)?.id ?? NONE.id, line.percent);
    }
  }
  return [...scentGroups, NONE, SOLVENT]
    .map((g) => ({ id: g.id, label: g.label, percent: totals.get(g.id) ?? 0 }))
    .filter((p) => p.percent > 0);
}

/** For the tall bar: scent groups under 3% fold into "Other", so it stays readable at a glance. */
function foldSmall(parts: Part[]): Part[] {
  const isGroup = (p: Part) => p.id !== NONE.id && p.id !== SOLVENT.id;
  const small = parts.filter((p) => isGroup(p) && p.percent < 3);
  if (small.length < 2) return parts;
  const other: Part = {
    id: "other",
    label: "Other scent groups",
    percent: small.reduce((sum, p) => sum + p.percent, 0),
    detail: small.map((p) => `${p.label} ${formatShare(p.percent)}`).join(", "),
  };
  const kept = parts.filter((p) => !small.includes(p));
  const firstOutside = kept.findIndex((p) => !isGroup(p));
  kept.splice(firstOutside === -1 ? kept.length : firstOutside, 0, other);
  return kept;
}

const describe = (p: Part) => `${p.label}: ${formatShare(p.percent)}${p.detail ? ` (${p.detail})` : ""}`;

/** Thin and without text, for beside "Jin has 4 of 9" on a card. */
export function ThinScentBar({ formula }: { formula: PublishedFormula }) {
  const parts = composition(formula);
  return (
    <div className="scent-bar scent-bar-thin" role="img" aria-label={`What it's made of. ${parts.map(describe).join("; ")}`}>
      {parts.map((p) => (
        <span key={p.id} data-group={p.id} data-tip={describe(p)} style={{ flexGrow: p.percent }} />
      ))}
    </div>
  );
}

/** Tall, with each part's share printed where it fits, and a legend of the parts it shows. */
export function TallScentBar({ formula }: { formula: PublishedFormula }) {
  const parts = foldSmall(composition(formula));
  return (
    <figure className="scent-figure">
      <div className="scent-bar scent-bar-tall" role="group" aria-label={`What it's made of. ${parts.map(describe).join("; ")}`}>
        {parts.map((p) => (
          <span key={p.id} data-group={p.id} data-tip={describe(p)} tabIndex={0} style={{ flexGrow: p.percent }}>
            {p.percent >= 9 && formatShare(p.percent)}
          </span>
        ))}
      </div>
      <figcaption>
        <ScentLegend parts={parts} />
      </figcaption>
    </figure>
  );
}

/** Names for the bar's colours: the parts of one formula, or (with no parts given) every colour. */
export function ScentLegend({ parts }: { parts?: Part[] }) {
  const items = parts ?? [...scentGroups, NONE, SOLVENT];
  return (
    <ul className="scent-legend">
      {items.map((p) => (
        <li key={p.id}>
          <span className="swatch" data-group={p.id} aria-hidden="true" />
          {p.label}
        </li>
      ))}
    </ul>
  );
}
