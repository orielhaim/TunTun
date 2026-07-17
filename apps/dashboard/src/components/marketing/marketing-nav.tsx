import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, MenuIcon, StarIcon, XIcon } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { type ReactNode, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { cn } from "@/lib/utils";

const loginSearch = { redirect: undefined as string | undefined };

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "Platform", href: "#platform" },
  { label: "Security", href: "#security" },
  { label: "Relays", href: "#relay" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "https://docs.tunnet.dev", external: true },
] as const;

export function MarketingNav(): ReactNode {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ease-out",
        scrolled
          ? "border-b border-white/10 bg-[oklch(0.14_0.012_235_/_0.75)] backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto grid h-16 max-w-[1200px] grid-cols-[auto_1fr_auto] items-center gap-4 px-5 sm:px-8">
        <Link to="/" className="inline-flex items-center gap-2.5 text-white">
          <img src="/logo.png" alt="Tunnet" className="size-8" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">
            Tunnet
          </span>
          <span className="ml-1 rounded-full border border-white/12 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-white/60">
            beta
          </span>
        </Link>

        <nav className="hidden justify-center md:flex" aria-label="Primary">
          <div className="flex items-center rounded-full border border-white/10 bg-white/[0.03] p-1 backdrop-blur">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                {...(item.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-white/70 transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <a
            href="https://github.com/tunnetio/Tunnet"
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[12px] font-medium text-white/80 transition-colors hover:border-white/25 sm:inline-flex"
          >
            <FaGithub className="size-3.5" />
            Star
            <span className="inline-flex items-center gap-1 text-white/50">
              <StarIcon className="size-3" />
              3.2k
            </span>
          </a>

          <Link
            to="/login"
            search={loginSearch}
            className="hidden rounded-full px-3.5 py-1.5 text-[13px] font-medium text-white/70 transition-colors hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>

          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }}>
            <Link
              to="/login"
              search={loginSearch}
              className="m-btn m-btn-primary h-9 !text-[13px]"
            >
              Get started
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </motion.div>

          <button
            type="button"
            className="grid size-9 place-items-center rounded-[10px] border border-white/10 bg-white/[0.03] text-white md:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <XIcon className="size-4" />
            ) : (
              <MenuIcon className="size-4" />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-white/10 bg-[var(--m-bg)] md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4">
              {NAV_LINKS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  {...(item.external
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-white/85"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <a
                href="https://github.com/tunnetio/Tunnet"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-white/60"
                onClick={() => setOpen(false)}
              >
                GitHub
              </a>
              <Link
                to="/login"
                search={loginSearch}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-white/60"
                onClick={() => setOpen(false)}
              >
                Sign in
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
