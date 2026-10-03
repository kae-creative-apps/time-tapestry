"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./WovenHero.module.css";

/** Decorative only. The hero's meaningful copy and controls remain server rendered. */
export function WovenHero({ className = "" }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = host.current;
    const surface = canvas.current;
    if (!element || !surface) return;

    // Coarse pointers and reduced motion receive the complete static artwork,
    // without downloading or initializing the renderer.
    const eligible = window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    let disposed = false;
    let visible = false;
    let loading = false;
    let renderer:
      | Awaited<
          ReturnType<typeof import("./woven-hero-renderer").createWovenRenderer>
        >
      | undefined;
    let failed = false;

    const sync = async () => {
      const active = eligible.matches && visible && !document.hidden;
      if (!eligible.matches) {
        renderer?.dispose();
        renderer = undefined;
        setReady(false);
      }
      if (renderer) {
        renderer.setActive(active);
        return;
      }
      if (!active || loading || failed || disposed) return;
      loading = true;
      try {
        const { createWovenRenderer } = await import("./woven-hero-renderer");
        if (disposed || !eligible.matches) return;
        const instance = await createWovenRenderer(surface, element, () => {
          failed = true;
          setReady(false);
        });
        if (disposed || !eligible.matches) {
          instance.dispose();
          return;
        }
        renderer = instance;
        setReady(true);
        instance.setActive(visible && !document.hidden);
      } catch {
        // The static swatch is the full experience when WebGL is unavailable.
        failed = true;
        if (!disposed) setReady(false);
      } finally {
        loading = false;
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        void sync();
      },
      { threshold: 0.05 },
    );
    observer.observe(element);
    eligible.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      disposed = true;
      observer.disconnect();
      eligible.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      renderer?.dispose();
    };
  }, []);

  return (
    <div
      ref={host}
      className={`${styles.stage} ${className}`}
      aria-hidden="true"
    >
      <div className={styles.halo} />
      <div className={`${styles.fallback} ${ready ? styles.replaced : ""}`}>
        {/* Native image keeps the static artwork independent of JavaScript. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/woven-hero-cloth.svg"
          alt=""
          width={1000}
          height={760}
          draggable={false}
        />
      </div>
      <canvas
        ref={canvas}
        className={`${styles.canvas} ${ready ? styles.ready : ""}`}
      />
    </div>
  );
}
