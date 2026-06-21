import Link from "next/link"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const plans = [
  {
    name: "Sober Curious",
    price: "$0",
    cadence: "/ forever",
    desc: "Everything you need to never walk home alone again.",
    features: ["Check-ins on your night out", "Ride booking over text", "Drunk-text blocking", "1 emergency contact"],
    cta: "Add for free",
    featured: false,
  },
  {
    name: "Last Call",
    price: "$8",
    cadence: "/ month",
    desc: "For the ones who close the place down. The full looking-after.",
    features: [
      "Everything in Sober Curious",
      "Vitals monitoring + auto-escalation",
      "Up to 5 emergency contacts",
      "Late-night food & water orders",
      "Priority response, all night",
    ],
    cta: "Start Last Call",
    featured: true,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-border/60 bg-secondary/40">
      <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <h2 className="text-balance font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          Cheaper than the round you&apos;d regret.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Start free. Step up when you want the full safety net watching over you.
        </p>

        <div className="mx-auto mt-14 grid max-w-3xl gap-6 text-left sm:grid-cols-2">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col rounded-3xl border p-7 shadow-sm",
                plan.featured
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card",
              )}
            >
              <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
              <div className="mt-4 flex items-end gap-1">
                <span className="font-serif text-5xl leading-none">{plan.price}</span>
                <span className={cn("pb-1 text-sm", plan.featured ? "text-background/70" : "text-muted-foreground")}>
                  {plan.cadence}
                </span>
              </div>
              <p className={cn("mt-3 text-sm leading-relaxed", plan.featured ? "text-background/70" : "text-muted-foreground")}>
                {plan.desc}
              </p>

              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className={cn("mt-0.5 size-4 shrink-0", plan.featured ? "text-accent" : "text-accent")} />
                    <span className={plan.featured ? "text-background/90" : ""}>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                render={<Link href="#get" />}
                nativeButton={false}
                size="lg"
                variant={plan.featured ? "secondary" : "default"}
                className="mt-7 h-11 w-full rounded-full"
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
