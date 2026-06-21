import Link from "next/link"
import { Button } from "@/components/ui/button"
import CurvedLoop from "@/components/CurvedLoop"

export function FinalCta() {
  return (
    <section id="get" className="border-t border-border/60">
      <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 sm:py-32">
        <h2 className="mx-auto max-w-2xl text-balance font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">
          Go out tonight. <span className="italic text-accent">Someone&apos;s got you.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">
          Add Drunk Buddy to your phone in a few seconds. Then forget about it, until the moment
          you&apos;re glad it&apos;s there.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            render={<Link href="#" />}
            nativeButton={false}
            size="lg"
            className="h-12 rounded-full px-8 text-base"
          >
            Message Drunk Buddy
          </Button>
          <Button
            render={<Link href="#how" />}
            nativeButton={false}
            size="lg"
            variant="ghost"
            className="h-12 rounded-full px-5 text-base text-muted-foreground hover:text-foreground"
          >
            Read how it works
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Free to start · No download 👋
        </p>
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-secondary/40">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        {/* curved looping brand marquee — drag to scrub */}
        <div>
          <CurvedLoop
            marqueeText="Drunk Buddy ✦ texts you home safe ✦ "
            speed={2}
            curveAmount={90}
            className="fill-muted-foreground"
          />
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Drunk Buddy. Text responsibly.</p>
          <p>Not a substitute for emergency services. If someone is in danger, call 911.</p>
        </div>
      </div>
    </footer>
  )
}
