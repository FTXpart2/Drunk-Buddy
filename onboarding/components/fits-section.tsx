import { Car, Pizza, ShieldBan, HeartPulse, BellRing, Footprints } from "lucide-react"

const chips = [
  { label: "Calls your Uber", icon: Car },
  { label: "Orders late night food", icon: Pizza },
  { label: "Blocks the ex text", icon: ShieldBan },
  { label: "Watches your vitals", icon: HeartPulse },
  { label: "Checks in on you", icon: BellRing },
  { label: "Walks you home", icon: Footprints },
]

export function FitsSection() {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <h2 className="mx-auto max-w-3xl text-balance font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          Drunk Buddy fits into your night,
          not the other way around.
        </h2>

        {/* floating capability chips */}
        <div className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-3">
          {chips.map(({ label, icon: Icon }) => (
            <span
              key={label}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-sm"
            >
              <Icon className="size-4 text-accent" />
              {label}
            </span>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          It lives right in your{" "}
          <span className="text-foreground">iMessage</span>, with the judgment of a sober best
          friend and the patience of one who never gets tired of you.
        </p>
      </div>
    </section>
  )
}
