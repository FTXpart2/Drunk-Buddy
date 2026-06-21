import { Lock, EyeOff, UserCheck, Trash2 } from "lucide-react"
import { Reveal } from "@/components/reveal"

const points = [
  {
    icon: UserCheck,
    title: "You set the rules",
    body: "Who to text, who not to, when to escalate, and who gets called. Drunk Buddy only acts inside the lines you draw.",
  },
  {
    icon: Lock,
    title: "Encrypted & private",
    body: "Your location and contacts stay yours. Everything is encrypted in transit and never sold or shared.",
  },
  {
    icon: EyeOff,
    title: "No dashboard, no feed",
    body: "There&apos;s nothing for anyone to scroll through. The conversation is the whole product, and it&apos;s just yours.",
  },
  {
    icon: Trash2,
    title: "Forget on command",
    body: "Text “forget tonight” and it wipes the night. Delete everything any time, no buried settings.",
  },
]

export function SafetySection() {
  return (
    <section id="safety" className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-12 md:grid-cols-[1fr_1.2fr] md:gap-16">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-accent">Safety &amp; trust</p>
            <h2 className="mt-3 text-balance font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
              A friend you can actually trust with the hard moments.
            </h2>
            <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
              Drunk Buddy steps in only when it should, and steps back when you&apos;ve got it.
              You&apos;re always in control of what it knows and what it does.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {points.map(({ icon: Icon, title, body }, i) => (
              <Reveal
                key={title}
                delay={i * 110}
                className="rounded-3xl border border-border bg-card p-6 shadow-sm"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
                <p
                  className="mt-2 text-pretty leading-relaxed text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
