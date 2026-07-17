import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;

export function registerMarketingMotion() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

export const easeOutExpo = "expo.out";
export const easeOutQuart = "power3.out";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function revealFrom(
  targets: gsap.TweenTarget,
  trigger: Element | string,
  extras: gsap.TweenVars = {},
) {
  if (prefersReducedMotion()) {
    gsap.set(targets, { clearProps: "all", opacity: 1, y: 0 });
    return;
  }
  gsap.from(targets, {
    opacity: 0,
    y: 20,
    duration: 0.85,
    stagger: 0.08,
    ease: easeOutQuart,
    scrollTrigger: {
      trigger,
      start: "top 82%",
      toggleActions: "play none none none",
    },
    ...extras,
  });
}
