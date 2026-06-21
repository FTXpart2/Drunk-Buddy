import { SiteHeader } from "@/components/site-header"
import { Hero } from "@/components/hero"
import { FitsSection } from "@/components/fits-section"
import { Features } from "@/components/features"
import { HowItWorks } from "@/components/how-it-works"
import { SafetySection } from "@/components/safety-section"
import { Pricing } from "@/components/pricing"
import { FinalCta, SiteFooter } from "@/components/cta-footer"

export default function Page() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main>
        <Hero />
        <FitsSection />
        <Features />
        <HowItWorks />
        <SafetySection />
        <Pricing />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
