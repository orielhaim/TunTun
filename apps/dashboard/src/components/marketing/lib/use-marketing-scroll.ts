import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useEffect } from "react";

let registered = false;
export function registerAllGsap() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText, Flip);
  registered = true;
}

/**
 * ScrollSmoother has to wrap the page. We opt-in only when the user has no
 * reduced-motion preference and we have a wrapper/content pair.
 */
export function useMarketingSmoother() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    registerAllGsap();
    const smoother = ScrollSmoother.create({
      wrapper: "#m-smooth-wrapper",
      content: "#m-smooth-content",
      smooth: 1.1,
      effects: true,
      normalizeScroll: true,
    });
    return () => {
      smoother.kill();
    };
  }, []);
}
