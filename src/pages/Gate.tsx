// The front door (/): one short looping film, tiled across the whole screen, with the name and
// "enter" low in the middle. The film is original: see scripts/film and the README.
//
// The tile under the pointer turns to a photographic negative, and now and then another one does by
// itself. Nothing moves for anyone who has asked their system to reduce motion, and "pause" stops
// the film for anyone else.

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Link, Navigate, useLocation, useNavigate } from "react-router";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** The size of one tile, and where the grid starts: one tile sits in the middle of the screen. */
function layout() {
  const w = Math.round(Math.min(600, Math.max(300, window.innerWidth * 0.34)));
  const h = Math.round(w * 0.75);
  return { w, h, ox: Math.round((window.innerWidth - w) / 2), oy: Math.round((window.innerHeight - h) / 2) };
}

export default function Gate() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const [paused, setPaused] = useState(reducedMotion.matches);
  const [grid, setGrid] = useState(layout);
  const pointerTile = useRef<HTMLDivElement>(null);
  const strayTile = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setGrid(layout());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Now and then a tile somewhere turns negative for a moment.
  useEffect(() => {
    if (paused) return;
    let timer: number;
    const flash = () => {
      const el = strayTile.current;
      if (el) {
        const x = grid.ox + grid.w * Math.floor(((Math.random() * window.innerWidth - grid.ox) / grid.w));
        const y = grid.oy + grid.h * Math.floor(((Math.random() * window.innerHeight - grid.oy) / grid.h));
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.opacity = "1";
        window.setTimeout(() => {
          if (strayTile.current) strayTile.current.style.opacity = "0";
        }, 120 + Math.random() * 260);
      }
      timer = window.setTimeout(flash, 1300 + Math.random() * 2600);
    };
    timer = window.setTimeout(flash, 1600);
    return () => window.clearTimeout(timer);
  }, [paused, grid]);

  // Old bookmarks of the ingredient list, with its filters in the address, still work.
  if (search) return <Navigate to={`/ingredients${search}`} replace />;

  const onPointerMove = (event: MouseEvent) => {
    const el = pointerTile.current;
    if (!el || paused) return;
    const x = grid.ox + grid.w * Math.floor((event.clientX - grid.ox) / grid.w);
    const y = grid.oy + grid.h * Math.floor((event.clientY - grid.oy) / grid.h);
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.opacity = "1";
  };
  const onPointerLeave = () => {
    if (pointerTile.current) pointerTile.current.style.opacity = "0";
  };

  // Going in: the old screen closes on the point that was clicked, like the iris of a silent film.
  const enter = (event: MouseEvent) => {
    if (!document.startViewTransition || reducedMotion.matches) return; // the link goes there as usual
    event.preventDefault();
    const root = document.documentElement;
    root.style.setProperty("--iris-x", `${event.clientX || window.innerWidth / 2}px`);
    root.style.setProperty("--iris-y", `${event.clientY || window.innerHeight / 2}px`);
    root.classList.add("iris");
    const transition = document.startViewTransition(() => flushSync(() => navigate("/lobby")));
    transition.finished.finally(() => root.classList.remove("iris"));
  };

  const style = {
    "--tile-w": `${grid.w}px`,
    "--tile-h": `${grid.h}px`,
    "--ox": `${grid.ox}px`,
    "--oy": `${grid.oy}px`,
  } as CSSProperties;

  return (
    <div className={`gate ${paused ? "is-paused" : ""}`} style={style} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <title>Jin's Perfumery Library</title>
      <div
        className="gate-film"
        role="img"
        aria-label="A looping black-and-white film, repeated across the screen: a snail with a stoppered glass flask for a shell glides along a garden path, leaving a silver trail and a thread of scent. The flask's label says Jin's."
      />
      <div className="gate-negative" ref={pointerTile} />
      <div className="gate-negative" ref={strayTile} />
      <div className="gate-print-shadow" />
      <div className="gate-print-light" />
      <div className="gate-grain" />
      <div className="gate-flicker" />
      <div className="gate-scrim" />

      <button type="button" className="gate-play" onClick={() => setPaused(!paused)} aria-pressed={paused}>
        {paused ? "play" : "pause"}
      </button>

      <Link to="/lobby" className="gate-door" onClick={enter}>
        <h1>
          <em>Jin's</em>
          <span>Perfumery Library</span>
        </h1>
        <span className="gate-rule" />
        <span className="gate-enter">enter</span>
      </Link>
    </div>
  );
}
