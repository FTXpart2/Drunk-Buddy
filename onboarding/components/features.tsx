import { Car, ShieldBan, HeartPulse, MoonStar } from "lucide-react"
import { AnimatedConversation } from "@/components/animated-conversation"
import { cn } from "@/lib/utils"

type Feature = {
  id: string
  tag: string
  icon: React.ElementType
  title: string
  body: string
  chat: { from: "buddy" | "you"; text: string }[]
}

const features: Feature[] = [
  {
    id: "checkin",
    tag: "Checks in",
    icon: MoonStar,
    title: "It notices when you go quiet.",
    body: "Drunk Buddy keeps a loose eye on the night. If you stop replying or your messages start to slur, it nudges you, gently first, then for real.",
    chat: [
      { from: "buddy", text: "you went dark 25 min ago. just a thumbs up and i&apos;ll leave you alone 👍" },
      { from: "you", text: "👍" },
      { from: "buddy", text: "good. drink some water for me, legend." },
    ],
  },
  {
    id: "uber",
    tag: "Gets you home",
    icon: Car,
    title: "A ride, before you even ask.",
    body: "It knows where you are and where home is. One text and there&apos;s a car outside, no fumbling with apps, no surge pricing panic at 2am.",
    chat: [
      { from: "you", text: "i think im ready to go home" },
      { from: "buddy", text: "got you. Uber booked, black Prius, 4 min away. plate ends 88X 🚗" },
      { from: "buddy", text: "i&apos;ll watch the trip till you&apos;re inside." },
    ],
  },
  {
    id: "ex",
    tag: "Saves you from yourself",
    icon: ShieldBan,
    title: "The drunk text never sends.",
    body: "Tell it who you shouldn&apos;t text tonight. When the urge hits, Drunk Buddy intercepts the message and holds it hostage until morning you can decide.",
    chat: [
      { from: "you", text: "im gonna text jordan one quick thing" },
      { from: "buddy", text: "no you&apos;re not 😌 i&apos;m holding it. read it back to me sober tmrw." },
      { from: "you", text: "...fine" },
    ],
  },
  {
    id: "escalate",
    tag: "Has your back",
    icon: HeartPulse,
    title: "If something&apos;s really wrong, it acts.",
    body: "Go silent too long or have your wearable flag a spike, and Drunk Buddy escalates, looping in the emergency contacts you set up, with your live location.",
    chat: [
      { from: "buddy", text: "haven&apos;t heard from you in 40 min + your heart rate spiked. checking in for real now." },
      { from: "buddy", text: "no reply, i&apos;m letting Sam know where you are. hang tight. ❤️" },
    ],
  },
]

export function Features() {
  return (
    <section id="features" className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wide text-accent">What it does</p>
          <h2 className="mt-3 text-balance font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            It does the looking out, so you can keep having fun.
          </h2>
        </div>

        <div className="mt-16 flex flex-col gap-20 sm:gap-28">
          {features.map((feature, i) => (
            <FeatureRow key={feature.id} feature={feature} flip={i % 2 === 1} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureRow({ feature, flip }: { feature: Feature; flip: boolean }) {
  const Icon = feature.icon
  return (
    <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
      <div className={cn(flip && "md:order-2")}>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium">
          <Icon className="size-4 text-accent" />
          {feature.tag}
        </span>
        <h3 className="mt-5 text-balance font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
          <span dangerouslySetInnerHTML={{ __html: feature.title }} />
        </h3>
        <p
          className="mt-4 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: feature.body }}
        />
      </div>

      <div className={cn(flip && "md:order-1")}>
        <div className="min-h-[210px] rounded-3xl border border-border bg-card/70 p-5 shadow-sm">
          <AnimatedConversation
            messages={feature.chat.map((m) => ({
              from: m.from,
              node: <span dangerouslySetInnerHTML={{ __html: m.text }} />,
            }))}
          />
        </div>
      </div>
    </div>
  )
}
