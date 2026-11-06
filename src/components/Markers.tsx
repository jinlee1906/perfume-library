// Small visual markers used on both pages.

import type { ReactNode } from "react";
import type { FilledValue } from "../types";

const FILLED_TOOLTIP = "Filled in by Claude, not from Jin's spreadsheet. Check it before relying on it.";

/** Shown in place of a value that isn't in the spreadsheet. */
export function Missing({ short = false }: { short?: boolean }) {
  return (
    <span className="missing" title="Not in Jin's spreadsheet">
      {short ? "—" : "Missing"}
    </span>
  );
}

/** A ⚠ icon. The explanation shows on hover and is read out by screen readers. */
export function WarningIcon({ text }: { text: string }) {
  return (
    <span className="warn-icon" role="img" aria-label={text} title={text}>
      {"⚠︎"}
    </span>
  );
}

/** Wraps a value Claude filled in, so it looks different from your own data. */
export function Filled({ children, info, showBadge = false }: { children: ReactNode; info?: FilledValue; showBadge?: boolean }) {
  if (!info) return <>{children}</>;
  return (
    <>
      <span className="filled" title={FILLED_TOOLTIP}>
        {children}
        <span className="visually-hidden"> (filled in by Claude)</span>
      </span>
      {showBadge && (
        <span className="badge badge-filled" title={FILLED_TOOLTIP}>
          filled in
        </span>
      )}
    </>
  );
}
