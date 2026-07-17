const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

const roundToStep = (v: number, step: number) => Math.round(v / step) * step;

const remap = (
  v: number,
  inLo: number,
  inHi: number,
  outLo: number,
  outHi: number,
) => ((v - inLo) * (outHi - outLo)) / (inHi - inLo) + outLo;

function bezierEase(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  eps = 1e-6,
): number {
  const bx = (t: number) =>
    3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3;
  const by = (t: number) =>
    3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
  const bxDeriv = (t: number) =>
    3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t ** 2 * (1 - x2);

  let t = x;
  for (let i = 0; i < 8; i++) {
    const dx = bx(t) - x;
    if (Math.abs(dx) < eps) return by(t);
    const d = bxDeriv(t);
    if (Math.abs(d) < 1e-6) break;
    t -= dx / d;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  while (lo < hi) {
    const cx = bx(t);
    if (Math.abs(cx - x) < eps) return by(t);
    if (cx < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return by(t);
}

export const ALL_VARIATIONS = [
  "charFill",
  "charInverse",
  "charAccent",
  "charAccentInverse",
  "charAccentFill",
  "charBorder",
] as const;

export type TyperType = "initial" | "in" | "out" | "inout" | "done";

export interface TyperOptions {
  fps?: number;
  cycles?: number;
  cycleLength?: number;
  delay?: number;
  variations?: string[];
  initVisible?: boolean;
}

interface CharNode {
  el: HTMLSpanElement;
  cp: number;
  currentClass: string;
}

export class Typer {
  private element: HTMLElement;
  private originalContent: string;
  private source: string;
  private length: number;
  private fps: number;
  private cycles: number;
  private cycleLength: number;
  private frames: number;
  private frame = 0;
  private loop: number | null = null;
  private delay: number;
  private delayTimer: number | null = null;
  private charNodes: CharNode[] = [];
  private type: TyperType = "initial";
  private divisor: number;
  private denominator: number;
  private variations: string[];
  private initVisible: boolean;

  constructor(element: HTMLElement, opts: TyperOptions = {}) {
    this.element = element;
    this.originalContent = element.innerHTML;
    this.source = element.textContent || "";
    this.length = this.source.replace(/\s/g, "").length;
    this.fps = opts.fps ?? 20;
    this.cycles = opts.cycles ?? 3;
    this.cycleLength = opts.cycleLength ?? 0.5;
    this.frames = this.length ? this.fps * (1 + this.length * 0.01) : 0;
    this.delay = opts.delay ?? 0;
    this.divisor = this.length > 1 ? this.length - 1 : 1;
    this.denominator = this.frames - this.frames * this.cycleLength || 1;
    this.variations = (opts.variations ?? [...ALL_VARIATIONS]).slice();
    this.shuffle();
    this.initVisible = opts.initVisible ?? false;

    if (this.length) {
      this.build();
      if (this.initVisible) {
        this.charNodes.forEach((n) => {
          this.setClass(n, "char");
        });
        this.type = "done";
        this.element.dataset.typerType = "done";
      } else {
        this.applyFrame();
        this.element.dataset.typerType = "initial";
      }
    }
  }

  private build() {
    this.element.innerHTML = "";
    this.charNodes = [];
    const parts = this.source.split(/(\s+)/);
    let i = 0;
    for (const part of parts) {
      if (part.trim() === "") {
        this.element.append(document.createTextNode(part));
        continue;
      }
      const word = document.createElement("span");
      word.className = "word";
      for (const ch of part.split("")) {
        const pos = i / this.divisor;
        const cp = roundToStep(bezierEase(pos, 0, 0.75, 0.75, 0), 0.05);
        const span = document.createElement("span");
        span.className = "char charInit";
        span.textContent = ch || " ";
        this.charNodes.push({ el: span, cp, currentClass: "char charInit" });
        i += 1;
        word.appendChild(span);
      }
      this.element.appendChild(word);
    }
  }

  reset(text: string) {
    this.stopLoop();
    this.source = text;
    this.length = text.replace(/\s/g, "").length;
    this.divisor = this.length > 1 ? this.length - 1 : 1;
    this.frames = this.length ? this.fps * (1 + this.length * 0.01) : 0;
    this.denominator = this.frames - this.frames * this.cycleLength || 1;
    this.frame = 0;
    this.type = "initial";
    this.build();
    this.applyFrame();
    this.element.dataset.typerType = "initial";
  }

  in() {
    this.setType("in");
  }
  out() {
    this.setType("out");
  }
  inOut() {
    this.setType("inout");
  }

  private setType(t: TyperType) {
    if (t === this.type && t !== "inout") return;
    this.type = t;
    this.element.dataset.typerType = t;
    this.stopLoop();
    this.frame = 0;
    this.applyFrame();
    if (t !== "initial" && this.charNodes.length) this.startLoop();
  }

  private startLoop() {
    if (this.loop || this.delayTimer || !this.charNodes.length) return;
    if (this.type === "initial") return;
    this.shuffle();
    const begin = () => {
      this.delayTimer = null;
      if (this.loop || this.type === "initial") return;
      this.applyFrame();
      this.loop = window.setInterval(() => this.tick(), 1000 / this.fps);
    };
    if (this.delay > 0) {
      this.delayTimer = window.setTimeout(begin, this.delay * 1000);
    } else {
      begin();
    }
  }

  private stopLoop() {
    if (this.delayTimer) {
      window.clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    if (this.loop) {
      window.clearInterval(this.loop);
      this.loop = null;
    }
  }

  private tick() {
    const total = this.type === "inout" ? this.frames * 2 : this.frames;
    this.frame += 1;
    this.frame = clamp(this.frame, 0, total);
    this.applyFrame();
    if (this.frame >= total) {
      this.stopLoop();
      this.type = "done";
      this.element.dataset.typerType = "done";
    }
  }

  private applyFrame() {
    if (!this.length || !this.charNodes.length) return;
    if (this.type === "initial") {
      this.charNodes.forEach((n) => {
        this.setClass(n, "char charInit");
      });
      return;
    }
    const phase =
      this.type === "inout" && this.frame > this.frames
        ? "out"
        : this.type === "inout"
          ? "in"
          : this.type;
    const progress =
      (this.type === "inout" && phase === "out"
        ? this.frame - this.frames
        : this.frame) / this.denominator;

    for (const node of this.charNodes) {
      let p = progress - node.cp;
      p = roundToStep(p, 0.1);
      p = clamp(p, 0, 1);

      let variation = "charInit";
      if (p > 0) {
        const idx = Math.round(remap(p, 0, 1, 0, this.cycles));
        variation = this.variations[idx % this.variations.length] ?? "charInit";
      }
      if (p >= 1) variation = "";
      const midClass = variation ? `char ${variation}` : "char";

      let cls: string;
      if (phase === "in") {
        cls = p <= 0 ? "char charInit" : p >= 1 ? "char" : midClass;
      } else {
        cls = p <= 0 ? "char" : p >= 1 ? "char charInit" : midClass;
      }
      this.setClass(node, cls);
    }
  }

  private setClass(node: CharNode, cls: string) {
    if (cls === node.currentClass) return;
    node.currentClass = cls;
    node.el.className = cls;
  }

  private shuffle() {
    this.variations.sort(() => 0.5 - Math.random());
  }

  destroy() {
    this.stopLoop();
    this.element.innerHTML = this.originalContent;
    delete this.element.dataset.typerType;
  }
}

export class TyperGroup {
  private typers: Typer[] = [];

  constructor(
    elements: HTMLElement[],
    opts: Omit<TyperOptions, "delay"> = {},
    stagger = 0.15,
  ) {
    this.typers = elements.map(
      (el, i) => new Typer(el, { ...opts, delay: i * stagger }),
    );
  }

  in() {
    this.typers.forEach((t) => {
      t.in();
    });
  }
  out() {
    this.typers.forEach((t) => {
      t.out();
    });
  }
  destroy() {
    this.typers.forEach((t) => {
      t.destroy();
    });
  }
}
