// Detail page (/ingredient/:id): a band in the colour of its scent group, then every spreadsheet
// field for one ingredient beside what the published formulas teach about it (its role, typical
// amount and best pairings), and the formulas and accords that use it.

import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { columnLabel, formatMoney, ingredientsById, isMixtureNote } from "../data";
import FormulaCard from "../components/FormulaCard";
import { Filled, Missing } from "../components/Markers";
import Seal from "../components/Seal";
import UsageRange from "../components/UsageRange";
import { groupOf } from "../families";
import { formatLimit, ifraLimitPercent } from "../formulaMath";
import { formatShare, formulasUsing, ingredientsFor, insightFor, learned, profileFor, roleForShare, shareIn } from "../formulary";
import { newFormula, useFormulas } from "../formulas";
import { mainFamily, suggestPairings } from "../pairings";
import type { FilledValue, Ingredient } from "../types";

export default function IngredientDetail() {
  const { id } = useParams();
  const location = useLocation();
  const ingredient = id ? ingredientsById.get(id) : undefined;

  // Go back to the list with the same search and filters the user came from.
  const fromSearch = (location.state as { fromSearch?: string } | null)?.fromSearch ?? "";
  const backLink = (
    <Link className="back" to={`/ingredients${fromSearch}`}>
      ← All ingredients
    </Link>
  );

  if (!ingredient) {
    return (
      <div className="page">
        {backLink}
        <h1>Ingredient not found</h1>
        <p>There's no ingredient at this address. It may have been renamed in the spreadsheet.</p>
      </div>
    );
  }
  const i = ingredient;

  return (
    <article className="detail" data-group={groupOf(i.odorFamily)?.id}>
      <title>{`${i.name.trim()} · Jin's Perfumery Library`}</title>
      <header className="specimen">
        <div className="specimen-text">
          {backLink}
          <p className="eyebrow">
            {[i.category, mainFamily(i.odorFamily)].filter(Boolean).join(" · ") || "Ingredient"}
          </p>
          <h1>{i.name}</h1>
          <p className="subtitle">
            {i.wishlist && <span className="badge">Not bought yet</span>}
            <span>Spreadsheet row {i.rowNumber}</span>
            <StartFormulaButton ingredient={i} />
          </p>
        </div>
        <Seal odorFamily={i.odorFamily} seed={i.id} className="specimen-seal" eager />
      </header>

      {i.warnings.length > 0 && (
        <section className="callout callout-warn" aria-label="Things to check">
          <h2>Things to check in Jin's spreadsheet</h2>
          <ul>
            {i.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <RelatedLinks ingredient={i} />
        </section>
      )}

      {i.filledNote && (
        <section className="callout callout-note">
          <h2>Note from Claude</h2>
          <p>{i.filledNote}</p>
        </section>
      )}

      <div className="detail-columns">
      <div className="spec-sheet">
      <section>
        <h2>Identity</h2>
        <dl className="fields">
          <Field label={columnLabel("cas", "CAS number")}>
            <CasValue ingredient={i} />
          </Field>
          <Field label={columnLabel("category", "Category")}>
            {i.category && <Filled info={i.filled.category} showBadge>{i.category}</Filled>}
          </Field>
          <Field label={columnLabel("odorFamily", "Odor family")}>
            {i.odorFamily && <Filled info={i.filled.odorFamily} showBadge>{i.odorFamily}</Filled>}
          </Field>
          <Field label={columnLabel("odorDescription", "Odor description")}>{i.odorDescription}</Field>
          <Field label={columnLabel("synonyms", "Synonyms / trade names")}>
            {i.synonyms.length > 0 && (
              <>
                <Filled info={i.filled.synonyms} showBadge>{i.synonyms.join("; ")}</Filled>
                {i.filled.synonyms && <p className="source">Source: names PubChem lists for this CAS number.</p>}
              </>
            )}
          </Field>
          <Field label={columnLabel("supplier", "Supplier")}>{i.supplier}</Field>
        </dl>
      </section>

      <section>
        <h2>Price</h2>
        <dl className="fields">
          <Field label={columnLabel("pricePerGram", "Price per gram")}>
            {i.pricePerGram !== null && (
              <>
                {formatMoney(i.pricePerGram, i.currency)}
                {i.priceIsCalculated && <span className="muted"> (calculated as cost ÷ size)</span>}
                {i.priceNote && <p className="source">{i.priceNote}</p>}
              </>
            )}
          </Field>
          {i.priceMismatch && i.calculatedPricePerGram !== null && (
            <Field label="Cost ÷ size">
              <span className="highlight">{formatMoney(i.calculatedPricePerGram, i.currency, 3)}</span>{" "}
              <span className="muted">doesn't match the cost per gram above</span>
            </Field>
          )}
          <Field label={columnLabel("bottlePrice", "Bottle price")}>
            {i.bottlePrice !== null && formatMoney(i.bottlePrice, i.currency)}
          </Field>
          <Field label={columnLabel("bottleSizeGrams", "Size (grams)")}>
            {i.bottleSizeGrams !== null && `${i.bottleSizeGrams} g`}
          </Field>
        </dl>
      </section>

      <section>
        <h2>IFRA and use</h2>
        <p className="muted small">
          IFRA limits are for Category 4 (fine fragrance). Average use is shown exactly as written in Jin's spreadsheet.
        </p>
        <dl className="fields">
          <Field label={columnLabel("ifraRestriction", "IFRA restriction")}>
            {i.ifraRestriction && (
              <>
                <Filled info={i.filled.ifraRestriction} showBadge>{i.ifraRestriction}</Filled>
                {/* Where the value came from, or what your own value was checked against */}
                <SourceLine info={i.filled.ifraRestriction ?? i.ifraCheck} />
              </>
            )}
          </Field>
          <Field label={columnLabel("averageUse", "Average use")}>{i.averageUse}</Field>
        </dl>
      </section>

      {Object.keys(i.extra).length > 0 && (
        <section>
          <h2>Other columns</h2>
          <dl className="fields">
            {Object.entries(i.extra).map(([header, value]) => (
              <Field key={header} label={header}>
                {String(value)}
              </Field>
            ))}
          </dl>
        </section>
      )}

      {/* Placeholder for a later phase, so the layout is ready. */}
      <PlaceholderSection title="Background" />
      </div>

      {/* What the supplier says, then what the published formulas teach. */}
      <div className="detail-main">
        <CharacterSection ingredient={i} />
        <UsageSection ingredient={i} />
        <PairingsSection ingredient={i} />
      </div>
      </div>

      <FormulasSection ingredient={i} />
    </article>
  );
}

/** One label/value row. Empty values show as "Missing". */
function Field({ label, children }: { label: string; children: ReactNode }) {
  const isEmpty = children === null || children === undefined || children === false || children === "";
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{isEmpty ? <Missing /> : children}</dd>
    </div>
  );
}

function CasValue({ ingredient: i }: { ingredient: Ingredient }) {
  if (i.cas.length === 0) {
    return i.casNotes.some(isMixtureNote) ? <span>None (mixture)</span> : <Missing />;
  }
  return (
    <>
      <Filled info={i.filled.cas} showBadge>{i.cas.join(", ")}</Filled>
      {i.casValid === true && <span className="ok"> ✓ check digit OK</span>}
      {i.casValid === false && <span className="bad"> ✗ not a valid CAS number</span>}
      <SourceLine info={i.filled.cas ?? i.casCheck} />
    </>
  );
}

/** A small line under a value: what the source says, plus a link to it. */
function SourceLine({ info }: { info: FilledValue | null | undefined }) {
  if (!info?.check && !info?.source) return null;
  const linkText = info.source?.includes("pubchem") ? "View on PubChem" : "View source";
  return (
    <p className="source">
      {info.check}{" "}
      {info.source && (
        <a href={info.source} target="_blank" rel="noreferrer">
          {linkText}
        </a>
      )}
    </p>
  );
}

/** Links to rows with the same name or CAS number. */
function RelatedLinks({ ingredient: i }: { ingredient: Ingredient }) {
  const related = [...new Set([...i.duplicates, ...i.sameCasAs])]
    .map((id) => ingredientsById.get(id))
    .filter((r): r is Ingredient => r !== undefined);
  if (related.length === 0) return null;
  return (
    <p className="related">
      Related:{" "}
      {related.map((r, n) => (
        <span key={r.id}>
          {n > 0 && ", "}
          <Link to={`/ingredient/${r.id}`}>
            {r.name} (row {r.rowNumber})
          </Link>
        </span>
      ))}
    </p>
  );
}

function PlaceholderSection({ title }: { title: string }) {
  return (
    <section className="placeholder">
      <h2>{title}</h2>
      <p>Coming in a later phase.</p>
    </section>
  );
}

/** Starts a new formula in Jin's builder with this ingredient in it. */
function StartFormulaButton({ ingredient }: { ingredient: Ingredient }) {
  const { saveFormula, status } = useFormulas();
  const navigate = useNavigate();
  const start = () => {
    const formula = newFormula();
    formula.name = `${ingredient.name.trim()} formula`;
    formula.lines = [{ ingredientId: ingredient.id, ingredientName: ingredient.name, grams: 0 }];
    saveFormula(formula);
    navigate(`/formulas/${formula.id}`);
  };
  return (
    <button type="button" className="button-small" onClick={start} disabled={status === "loading" || status === "error"}>
      Start a formula with this
    </button>
  );
}

/** The supplier's facts about the material: note, typical use, longevity, odour profile, uses, blends. */
function CharacterSection({ ingredient: i }: { ingredient: Ingredient }) {
  const p = profileFor(i.id);
  if (!p) return null;
  const hasFormulaRole = insightFor(i.id)?.role != null;
  const supplierRole = p.averageUsePercent !== null ? roleForShare(p.averageUsePercent) : null;
  return (
    <section>
      <div className="section-heading">
        <h2>
          Character and purpose <span className="heading-aside">from {p.source}</span>
        </h2>
        <a className="small" href={p.url} target="_blank" rel="noreferrer">
          {p.source} product page ↗
        </a>
      </div>
      <div className="stat-row">
        {p.classification && (
          <div className="stat">
            <span className="stat-value">{p.classification.replace(/ Note$/i, "")}</span>
            <span className="stat-label">note ({possessive(p.source)} classification)</span>
          </div>
        )}
        {p.averageUsePercent !== null && (
          <div className="stat">
            <span className="stat-value">{formatShare(p.averageUsePercent)}</span>
            <span className="stat-label">
              {p.usage
                ? `average in a perfume compound (from ${formatShare(p.usage.from)}, up to ${formatShare(p.usage.max)})`
                : "average in a perfume compound"}
            </span>
          </div>
        )}
        {p.longevity && (
          <div className="stat">
            <span className="stat-value">{formatHours(p.longevityHours)}</span>
            <span className="stat-label">on a smelling strip</span>
          </div>
        )}
        {p.relativeImpact != null && (
          <div className="stat">
            <span className="stat-value">{p.relativeImpact}</span>
            <span className="stat-label">relative odour impact (PerfumersWorld scale)</span>
          </div>
        )}
      </div>
      {p.impression && p.impression.length > 0 && (
        <p className="chip-row">
          <span className="muted small">Odour profile:</span>{" "}
          {p.impression.map((x) => (
            <span key={x.label} className="chip">
              {x.label} <span className="muted">{formatShare(x.percent)}</span>
            </span>
          ))}
        </p>
      )}
      {p.odourFamily && <p className="muted small">Odour family ({p.source}): {p.odourFamily}</p>}
      {p.uses && p.uses.length > 0 && (
        <p className="chip-row">
          <span className="muted small">Used for:</span>{" "}
          {p.uses.map((u) => (
            <span key={u} className="chip">
              {u}
            </span>
          ))}
        </p>
      )}
      {p.blendsWith.length > 0 && (
        <p className="small">
          <span className="muted">Blends well with ({p.source}): </span>
          {p.blendsWith.map((b, n) => {
            const owned = ingredientsFor(b.ingredientIds)[0];
            return (
              <span key={b.name}>
                {n > 0 && ", "}
                {owned ? <Link to={`/ingredient/${owned.id}`}>{owned.name.trim()}</Link> : b.name}
              </span>
            );
          })}
        </p>
      )}
      {!hasFormulaRole && supplierRole && (
        <p className="muted small">
          No published formula in the formulary uses it yet. Going by {possessive(p.source)} average use, it would usually be a{" "}
          <strong>{supplierRole.role}</strong> material ({supplierRole.meaning}).
        </p>
      )}
      <p className="muted small">
        Supplier figures are for the perfume concentrate and are guidance, not limits; IFRA limits still apply.
      </p>
    </section>
  );
}

/** "Fraterworks" -> "Fraterworks'", "PerfumersWorld" -> "PerfumersWorld's" */
function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/** 131 -> "131 h", 720 -> "30 days", 0.5 -> "<1 h" */
function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h >= 48) return `${Math.round(h / 24)} days`;
  if (h < 1) return "<1 h";
  return `${Number(h.toFixed(1))} h`;
}

/** How much of a perfume this ingredient usually is, from the published formulas. */
function UsageSection({ ingredient: i }: { ingredient: Ingredient }) {
  const insight = insightFor(i.id);
  const limit = ifraLimitPercent(i.ifraRestriction);
  return (
    <section>
      <h2>Usage in published formulas</h2>
      {!insight ? (
        <p className="muted">None of the {learned.learnedFrom} published formulas in the formulary use this ingredient yet.</p>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-value">{insight.formulaCount}</span>
              <span className="stat-label">of {learned.learnedFrom} formulas use it</span>
            </div>
            {insight.neatPercent && (
              <div className="stat">
                <span className="stat-value">{formatShare(insight.neatPercent.median)}</span>
                <span className="stat-label">typical share of a perfume</span>
              </div>
            )}
            {insight.role && (
              <div className="stat">
                <span className="stat-value">{insight.role}</span>
                <span className="stat-label">{insight.roleMeaning}</span>
              </div>
            )}
          </div>
          {insight.neatPercent ? (
            <>
              <UsageRange {...insight.neatPercent} />
              <p className="muted small">
                Share of the perfume concentrate (before dilution in alcohol), as pure material, across{" "}
                {insight.perfumeCount} perfume{insight.perfumeCount === 1 ? "" : "s"}. This is what published formulas do,
                not a recommended amount.
                {limit !== null && limit !== Infinity && (
                  <>
                    {" "}
                    Jin's IFRA limit is {formatLimit(limit)}% of the finished product: in an EdP at 20% that allows up to{" "}
                    {formatLimit(Math.min(100, limit * 5))}% of the concentrate.
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="muted small">Only used in accords so far, so there's no typical share of a full perfume yet.</p>
          )}
        </>
      )}
    </section>
  );
}

/** Ingredients from Jin's library that pair with this one. */
function PairingsSection({ ingredient }: { ingredient: Ingredient }) {
  const suggestions = suggestPairings([ingredient], 14);
  const evidence = suggestions.filter((s) => s.basis === "formulas");
  const supplier = suggestions.filter((s) => s.basis === "supplier");
  const families = suggestions.filter((s) => s.basis === "family");
  const top = evidence[0]?.score ?? 1;
  return (
    <section>
      <h2>Pairs well with</h2>
      {suggestions.length === 0 && <p className="muted">No suggestions yet: no published formula uses it, and it has no odor family.</p>}
      {evidence.length > 0 && (
        <>
          <p className="muted small">Ingredients in Jin's library that perfumers most often use with it, from the published formulas.</p>
          <ul className="pair-list">
            {evidence.map(({ ingredient: p, sameMaterial, score, reasons }) => (
              <li key={p.id}>
                <div className="pair-name" data-group={groupOf(p.odorFamily)?.id}>
                  <span className="swatch" aria-hidden="true" />
                  <Link to={`/ingredient/${p.id}`}>{p.name}</Link>
                  {p.wishlist && <span className="badge">Not bought yet</span>}
                  {sameMaterial.length > 0 && (
                    <span className="muted small"> (also {sameMaterial.map((m) => m.name.trim()).join(", ")})</span>
                  )}
                </div>
                <div className="pair-bar" aria-hidden="true">
                  <span style={{ width: `${(score / top) * 100}%` }} />
                </div>
                <div className="muted small pair-why">
                  {reasons[0].why}
                  {reasons[0].formulaTitles.length > 0 && `, e.g. ${reasons[0].formulaTitles.join(", ")}`}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {supplier.length > 0 && (
        <p className="small">
          <span className="muted">The supplier also suggests: </span>
          {supplier.map(({ ingredient: p }, n) => (
            <span key={p.id}>
              {n > 0 && ", "}
              <Link to={`/ingredient/${p.id}`}>{p.name.trim()}</Link>
            </span>
          ))}
        </p>
      )}
      {evidence.length < 6 && families.length > 0 && (
        <>
          <p className="muted small">
            {evidence.length ? "More ideas" : "No published formula uses it yet, so these"} by odor family (general guidance):
          </p>
          <ul className="pairing-list">
            {families.slice(0, 8 - Math.min(evidence.length, 6)).map(({ ingredient: p, reasons }) => (
              <li key={p.id}>
                <Link to={`/ingredient/${p.id}`}>{p.name}</Link>
                {p.wishlist && <span className="badge">Not bought yet</span>}
                <span className="muted small"> · {reasons[0].why}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Published formulas and accords that use this ingredient: accords first, then by how much Jin can make. */
function FormulasSection({ ingredient: i }: { ingredient: Ingredient }) {
  const [showAll, setShowAll] = useState(false);
  const all = formulasUsing(i.id);
  if (all.length === 0) return null;
  const accords = all.filter((f) => f.kind === "accord");
  const others = all.filter((f) => f.kind !== "accord").sort((a, b) => shareIn(b, i.id).percent - shareIn(a, i.id).percent);
  const ordered = [...accords, ...others];
  const shown = showAll ? ordered : ordered.slice(0, 6);
  return (
    <section className="formulas-section">
      <div className="section-heading">
        <h2>
          Formulas and accords with {i.name.trim()} <span className="heading-aside">{all.length}</span>
        </h2>
        <Link className="small" to={`/formulary?uses=${i.id}`}>
          Open in the formulary →
        </Link>
      </div>
      <p className="muted small">Accords first, then the formulas that use the most of it.</p>
      <div className="card-grid card-grid-tight">
        {shown.map((f) => (
          <FormulaCard key={f.id} formula={f} share={shareIn(f, i.id)} />
        ))}
      </div>
      {ordered.length > shown.length && (
        <button type="button" className="button-small show-more" onClick={() => setShowAll(true)}>
          Show all {ordered.length}
        </button>
      )}
    </section>
  );
}
