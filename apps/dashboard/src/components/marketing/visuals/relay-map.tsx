import createGlobe from "cobe";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Loc = [number, number]; // [lat, lng]

const REGIONS: { id: string; name: string; loc: Loc }[] = [
  { id: "sfo", name: "SFO", loc: [37.7749, -122.4194] },
  { id: "nyc", name: "NYC", loc: [40.7128, -74.006] },
  { id: "ldn", name: "LDN", loc: [51.5072, -0.1276] },
  { id: "fra", name: "FRA", loc: [50.1109, 8.6821] },
  { id: "sgp", name: "SGP", loc: [1.3521, 103.8198] },
  { id: "tyo", name: "TYO", loc: [35.6762, 139.6503] },
  { id: "syd", name: "SYD", loc: [-33.8688, 151.2093] },
  { id: "sao", name: "SAO", loc: [-23.5505, -46.6333] },
  { id: "jnb", name: "JNB", loc: [-26.2041, 28.0473] },
  { id: "dub", name: "DUB", loc: [25.2048, 55.2708] },
];

const ARCS: [string, string][] = [
  ["sfo", "nyc"],
  ["nyc", "ldn"],
  ["ldn", "fra"],
  ["fra", "sgp"],
  ["sgp", "tyo"],
  ["tyo", "sfo"],
  ["sao", "nyc"],
  ["syd", "sgp"],
  ["dub", "fra"],
  ["jnb", "fra"],
  ["sfo", "tyo"],
];

const byId = (id: string) => REGIONS.find((r) => r.id === id)!;

export function RelayGlobe({
  className,
  interactive = false,
  size = 720,
}: {
  className?: string;
  interactive?: boolean;
  size?: number;
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointerX = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let phi = 0.4;
    const theta = 0.24;
    let _width = 0;
    let currentPointerX = 0;
    let targetPointerX = 0;

    const onResize = () => {
      if (!wrapRef.current) return;
      _width = wrapRef.current.clientWidth;
    };
    onResize();
    window.addEventListener("resize", onResize);

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: size * 2,
      height: size * 2,
      phi,
      theta,
      dark: 1,
      diffuse: 1.4,
      mapSamples: 20000,
      mapBrightness: 5.2,
      mapBaseBrightness: 0.05,
      baseColor: [0.32, 0.42, 0.52],
      markerColor: [0.62, 0.94, 0.86],
      glowColor: [0.42, 0.72, 0.7],
      opacity: 0.98,
      markers: REGIONS.map((r) => ({ location: r.loc, size: 0.05, id: r.id })),
      arcs: ARCS.map(([f, t]) => ({
        from: byId(f).loc,
        to: byId(t).loc,
        color: [0.62, 0.94, 0.86],
      })),
      arcColor: [0.62, 0.94, 0.86],
      arcWidth: 0.6,
      arcHeight: 0.34,
      onRender(state) {
        if (!isDragging.current) phi += 0.0025;
        currentPointerX += (targetPointerX - currentPointerX) * 0.08;
        state.phi = phi + currentPointerX / 240;
        state.width = size * 2;
        state.height = size * 2;
      },
    });

    // Fade the canvas in after first paint to avoid a flash
    requestAnimationFrame(() => {
      canvas.style.opacity = "1";
    });

    const onDown = (e: PointerEvent) => {
      if (!interactive) return;
      isDragging.current = true;
      pointerX.current = e.clientX - currentPointerX;
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      targetPointerX = e.clientX - pointerX.current;
    };
    const onUp = () => {
      isDragging.current = false;
      canvas.style.cursor = "grab";
    };

    if (interactive) {
      canvas.style.cursor = "grab";
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      globe.destroy();
    };
  }, [interactive, size]);

  return (
    <div
      ref={wrapRef}
      className={cn("relative aspect-square w-full", className)}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          aspectRatio: "1",
          contain: "layout paint size",
          opacity: 0,
          transition: "opacity 1.2s ease",
        }}
      />
      {/* CSS-anchored labels */}
      {REGIONS.map((r) => (
        <div
          key={r.id}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-[10px] font-medium tracking-[0.14em] uppercase"
          style={{
            /* @ts-expect-error CSS anchor */
            positionAnchor: `--cobe-${r.id}`,
            top: "anchor(top)",
            left: "anchor(center)",
            marginTop: "-6px",
            opacity: `var(--cobe-visible-${r.id}, 0)` as unknown as number,
            transition: "opacity .3s ease",
            color: "oklch(0.82 0.14 185)",
            textShadow: "0 0 12px oklch(0.62 0.18 210 / 0.7)",
          }}
        >
          {r.name}
        </div>
      ))}
    </div>
  );
}
