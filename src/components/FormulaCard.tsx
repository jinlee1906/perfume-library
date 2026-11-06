// A published formula as a card: title, style, what it smells like, how much of it
// Jin can make, and links to the source. A Basenotes thread, when there is one, is
// linked underneath the formula.

import { Link } from "react-router";
import { coverage, formatShare, kindLabel, smellsLikeText } from "../formulary";
import { ThinScentBar } from "./ScentBar";
import type { PublishedFormula } from "../types";

interface Props {
  formula: PublishedFormula;
  // On an ingredient page: that ingredient's share of this formula.
  share?: { percent: number; neatPercent: number };
}

export default function FormulaCard({ formula: f, share }: Props) {
  const c = coverage(f);
  return (
    <article className="formula-card">
      <p className="eyebrow">
        {kindLabel[f.kind]}
        {f.year && ` · ${f.year}`}
        {c.total > 0 && c.owned === c.total && <span className="ready">Ready to make</span>}
      </p>
      <h3>
        <Link to={`/formulary/${f.id}`}>{f.title}</Link>
      </h3>
      {f.style && <p className="formula-card-style">{f.style}</p>}
      {f.smellsLike && <p className="muted small">{smellsLikeText(f.smellsLike)}</p>}

      {share && (
        <p className="formula-card-share">
          <span className="share-value">{formatShare(share.percent)}</span>
          <span className="muted small">
            {" "}
            of the formula
            {Math.abs(share.neatPercent - share.percent) > 0.0001 && ` (${formatShare(share.neatPercent)} as pure material)`}
          </span>
        </p>
      )}

      <div className="coverage" title={`${c.owned} of ${c.total} materials are in Jin's library (${c.exact} exact, ${c.owned - c.exact} same material)`}>
        <ThinScentBar formula={f} />
        <span className="small">
          Jin has {c.owned} of {c.total}
        </span>
      </div>

      <SourceLinks formula={f} />
    </article>
  );
}

/** Links to the published source, the article about it and any Basenotes thread. */
export function SourceLinks({ formula: f }: { formula: PublishedFormula }) {
  return (
    <div className="source-links">
      <a href={f.url} target="_blank" rel="noreferrer">
        {f.source} {/\.pdf(\?|#|$)/i.test(f.url) ? "PDF" : "source"} ↗
      </a>
      {f.article && (
        <a href={f.article} target="_blank" rel="noreferrer">
          Article ↗
        </a>
      )}
      {f.thread && (
        <a className="thread-link" href={f.thread} target="_blank" rel="noreferrer">
          Basenotes thread ↗
        </a>
      )}
    </div>
  );
}
