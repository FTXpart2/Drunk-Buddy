import Link from "next/link"
import { MessageCircleHeart } from "lucide-react"
import { Button } from "@/components/ui/button"

const nav = [
  { label: "How it works", href: "#how" },
  { label: "What it does", href: "#features" },
  { label: "Safety", href: "#safety" },
  { label: "Pricing", href: "#pricing" },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="#" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-background">
            <MessageCircleHeart className="size-4" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Drunk Buddy</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {nav.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="#"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Log in
          </Link>
          <Button render={<Link href="#get" />} nativeButton={false} className="rounded-full px-5">
            Add to iMessage
          </Button>
        </div>
      </div>
    </header>
  )
}
