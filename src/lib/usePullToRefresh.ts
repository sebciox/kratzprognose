import { useEffect, useRef, useState } from "react";

/** Angezeigte Zugstrecke (px), ab der das Loslassen aktualisiert. Der Zug wird halbiert, das entspricht 64 px Fingerweg. */
export const PULL_READY = 32;
/** Mehr als so weit folgt der Inhalt dem Finger nicht. */
const PULL_MAX = 96;

/**
 * Herunterziehen zum Aktualisieren. Eine installierte Web-App auf dem iPhone hat diese Geste
 * nicht von selbst. Aktiv nur ganz oben auf der Seite, mit einem Finger und nicht in
 * Eingabefeldern oder in Bereichen mit `data-no-pull`.
 */
export function usePullToRefresh(onRefresh: () => void): number {
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    const setBoth = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const blocked = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest("select, input, textarea, [data-no-pull]");

    const onStart = (e: TouchEvent) => {
      start.current = e.touches.length === 1 && window.scrollY <= 0 && !blocked(e.target) ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current !== 0) setBoth(0);
        return;
      }
      setBoth(Math.min(PULL_MAX, dy * 0.5));
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      if (pullRef.current >= PULL_READY) refresh.current();
      setBoth(0);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return pull;
}
