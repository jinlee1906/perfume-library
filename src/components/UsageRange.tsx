// A one-line chart of how much of a perfume an ingredient makes up across published
// formulas: the thin line is the full range, the box holds the middle half of uses,
// and the tick is the typical (median) amount. Log scale, so 0.01% and 20% both fit.

import { formatShare } from "../formulary";

const MIN = 0.001; // % (left edge)
const MAX = 50; // % (right edge)
const TICKS = [0.01, 0.1, 1, 10];

const position = (v: number) => {
  const clamped = Math.min(MAX, Math.max(MIN, v));
  return ((Math.log10(clamped) - Math.log10(MIN)) / (Math.log10(MAX) - Math.log10(MIN))) * 100;
};

interface Props {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
}

export default function UsageRange({ min, p25, median, p75, max }: Props) {
  const label = `Ranges from ${formatShare(min)} to ${formatShare(max)}; middle half of uses ${formatShare(p25)}–${formatShare(p75)}; typical ${formatShare(median)}.`;
  return (
    <figure className="usage-range" aria-label={label}>
      <div className="usage-track" aria-hidden="true">
        {TICKS.map((t) => (
          <span key={t} className="usage-grid" style={{ left: `${position(t)}%` }} />
        ))}
        <span className="usage-whisker" data-tip={`Full range: ${formatShare(min)} to ${formatShare(max)}`} style={{ left: `${position(min)}%`, width: `${position(max) - position(min)}%` }} />
        <span className="usage-box" data-tip={`Middle half of uses: ${formatShare(p25)} to ${formatShare(p75)}`} style={{ left: `${position(p25)}%`, width: `${Math.max(0.8, position(p75) - position(p25))}%` }} />
        <span className="usage-median" data-tip={`Typical: ${formatShare(median)}`} style={{ left: `${position(median)}%` }} />
      </div>
      <div className="usage-ticks" aria-hidden="true">
        {TICKS.map((t) => (
          <span key={t} style={{ left: `${position(t)}%` }}>
            {formatShare(t)}
          </span>
        ))}
      </div>
      <figcaption className="muted small">{label}</figcaption>
    </figure>
  );
}
