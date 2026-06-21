import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PhoneMockup } from "@/components/phone-mockup"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 pb-0 pt-16 text-center sm:px-6 sm:pt-24">
        <Link
          href="#features"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pl-1.5 pr-3 text-sm shadow-sm"
        >
          <span className="flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
            <Sparkles className="size-3" />
            New
          </span>
          <span className="text-muted-foreground">Now living in your iMessage</span>
        </Link>

        <h1 className="mx-auto mt-7 max-w-4xl text-balance font-serif text-5xl leading-[1.02] tracking-tight sm:text-7xl">
          The friend who texts you
          <br className="hidden sm:block" />{" "}
          <span className="italic text-accent">home safe&nbsp;</span>when you can&apos;t.
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Drunk Buddy is a contact in your phone — an AI friend that looks out for you on a night
          out. No app to open. You just text it like a person, and it quietly handles the rest.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            render={<Link href="#get" />}
            nativeButton={false}
            size="lg"
            className="h-12 rounded-full px-7 text-base"
          >
            Add Drunk Buddy
          </Button>
          <Button
            render={<Link href="#how" />}
            nativeButton={false}
            size="lg"
            variant="ghost"
            className="h-12 gap-1.5 rounded-full px-5 text-base text-muted-foreground hover:text-foreground"
          >
            See how it works <ArrowRight className="size-4" />
          </Button>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Free to start · No app download · Works in Messages, WhatsApp &amp; Telegram
        </p>

        {/* phone */}
        <div className="relative mt-14 sm:mt-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 -z-10 bg-gradient-to-b from-transparent to-background"
          />
          <PhoneMockup />
        </div>
      </div>
    </section>
  )
}
