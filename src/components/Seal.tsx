// A round specimen of an odor family: the family's texture, tinted with its scent group's colour.
// Every ingredient in a family turns the same seal to its own angle, so no two look quite alike.
// The seal is decoration: the family's name is always written next to it.

import type { CSSProperties } from "react";
import { groupOf, hashOf, sealUrl } from "../families";
import { mainFamily } from "../pairings";

interface Props {
  odorFamily: string | null;
  seed?: string; // turns the seal; leave out for the family's own, upright seal
  small?: boolean; // uses the small file, for swatches in lists
  className?: string;
  eager?: boolean; // load straight away (for the big seal at the top of a page)
}

export default function Seal({ odorFamily, seed, small = false, className = "", eager = false }: Props) {
  const family = mainFamily(odorFamily);
  const group = groupOf(odorFamily);
  if (!family || !group) return <span className={`seal seal-blank ${className}`} aria-hidden="true" />;
  const hash = seed ? hashOf(seed) : 0;
  const style = {
    "--turn": `${hash % 360}deg`,
    "--zoom": seed ? 1.08 + ((hash >> 9) % 40) / 100 : 1,
  } as CSSProperties;
  return (
    <span className={`seal ${className}`} data-group={group.id} aria-hidden="true">
      <img src={sealUrl(family, small)} alt="" loading={eager ? "eager" : "lazy"} decoding="async" style={style} />
    </span>
  );
}
