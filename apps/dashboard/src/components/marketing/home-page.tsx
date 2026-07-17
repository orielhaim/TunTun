import type { ReactNode } from "react";
import "@/marketing.css";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { AudienceQuotesSection } from "@/components/marketing/sections/audience-quotes";
import { CommandsTimelineSection } from "@/components/marketing/sections/commands-timeline";
import { FaqSection } from "@/components/marketing/sections/faq";
import { FinalCtaSection } from "@/components/marketing/sections/final-cta";
import { HeroSection } from "@/components/marketing/sections/hero";
import { OpenSourceSection } from "@/components/marketing/sections/open-source";
import { PricingTeaserSection } from "@/components/marketing/sections/pricing-teaser";
import { ProductShowcaseSection } from "@/components/marketing/sections/product-showcase";
import { RelayGlobeSection } from "@/components/marketing/sections/relay-globe";
import { SecuritySection } from "@/components/marketing/sections/security";
import { TrustMarquee } from "@/components/marketing/sections/trust-marquee";
import { TwoModesSection } from "@/components/marketing/sections/two-modes";

export function HomePage(): ReactNode {
  return (
    <div className="marketing-root relative min-h-svh overflow-x-hidden bg-[var(--m-bg)] text-[var(--m-fg)]">
      <MarketingNav />
      <main>
        <HeroSection />
        <TrustMarquee />
        <ProductShowcaseSection />
        <TwoModesSection />
        <RelayGlobeSection />
        <SecuritySection />
        <CommandsTimelineSection />
        <OpenSourceSection />
        <AudienceQuotesSection />
        <PricingTeaserSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
