import { Reveal } from "@/components/reveal"

const steps = [
  {
    n: "01",
    title: "Save the contact",
    body: "Tap add, and Drunk Buddy lands in your phone like any other friend. No app, no account to babysit.",
  },
  {
    n: "02",
    title: "Tell it about your night",
    body: "Set your home address, who not to text, and your emergency contacts. Takes about a minute, once.",
  },
  {
    n: "03",
    title: "Just text it like a person",
    body: "Going out? Say hi. From there it checks in, books rides, and steps in when you need it, all over text.",
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-border/60 bg-secondary/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wide text-accent">How it works</p>
          <h2 className="mt-3 text-balance font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            Set up once. Looked after every night.
          </h2>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <Reveal
              key={step.n}
              delay={i * 120}
              className="rounded-3xl border border-border bg-card p-7 shadow-sm"
            >
              <span className="font-serif text-4xl text-accent">{step.n}</span>
              <h3 className="mt-4 text-xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{step.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
