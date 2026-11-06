// One of the site's little films (rendered by scripts/film), or its still frame for anyone who has
// asked their system to reduce motion.

import { filmUrl } from "../families";

export default function FilmLoop({ name, alt, className }: { name: string; alt: string; className?: string }) {
  return (
    <picture className={className}>
      <source media="(prefers-reduced-motion: reduce)" srcSet={filmUrl(`${name}-still`)} />
      <img src={filmUrl(name)} alt={alt} decoding="async" />
    </picture>
  );
}
