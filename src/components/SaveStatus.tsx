// Shows whether formula changes have been saved (to data/formulas.json, or in this browser on the
// hosted site).

import { savesInBrowser, useFormulas } from "../formulas";

export default function SaveStatus() {
  const { status, error } = useFormulas();
  if (status === "error") return <span className="save-status bad" role="alert">{error}</span>;
  const saved = savesInBrowser ? "All changes saved in this browser" : "All changes saved";
  const text = { loading: "Loading…", saving: "Saving…", saved }[status];
  return <span className="save-status muted small" aria-live="polite">{text}</span>;
}
