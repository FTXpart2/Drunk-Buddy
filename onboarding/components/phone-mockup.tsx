"use client"

import { ChevronLeft, Video, Plus, ArrowUp } from "lucide-react"
import { ChatTimestamp } from "@/components/chat"
import { AnimatedConversation, type ChatMessage } from "@/components/animated-conversation"
import { cn } from "@/lib/utils"

const messages: ChatMessage[] = [
  { from: "buddy", node: <>heyyy you been quiet for a bit. you good? 👀</> },
  { from: "you", node: <>im FINE im having the best night everrr</> },
  { from: "buddy", node: <>love that for you. you still at The Vine?</> },
  { from: "you", node: <>yeah why</> },
  {
    from: "buddy",
    node: (
      <>cool cool. booked you an Uber home for whenever, it&apos;s 6 min out. say the word and i&apos;ll send it 🚕</>
    ),
  },
  { from: "you", node: <>ur the best honestly</> },
  {
    from: "buddy",
    node: <>i know 😌 also… do NOT text Jordan. i&apos;m holding that one for you.</>,
  },
]

export function PhoneMockup({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[340px] rounded-[2.75rem] border border-border/60 bg-foreground p-2.5 shadow-2xl shadow-foreground/20",
        className,
      )}
    >
      {/* screen */}
      <div className="relative overflow-hidden rounded-[2.25rem] bg-card">
        {/* notch */}
        <div className="pointer-events-none absolute left-1/2 top-2 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-foreground" />

        {/* iMessage header */}
        <div className="flex items-center justify-between border-b border-border/60 bg-card/90 px-3 pb-2 pt-9 backdrop-blur">
          <ChevronLeft className="size-5 text-imessage" />
          <div className="flex flex-col items-center">
            <div className="flex size-9 items-center justify-center rounded-full bg-accent text-base font-semibold text-accent-foreground">
              DB
            </div>
            <div className="mt-1 flex items-center gap-1 text-[12px] font-medium text-foreground">
              Drunk Buddy
            </div>
          </div>
          <Video className="size-5 text-imessage" />
        </div>

        {/* conversation — fixed height; the thread sits at the bottom like a real chat.
            overflow-hidden so a long thread clips at the top instead of bleeding into the header */}
        <div className="flex h-[480px] flex-col overflow-hidden px-3 py-4">
          <div className="mt-auto flex flex-col gap-2.5">
            <ChatTimestamp>Today 11:47 PM</ChatTimestamp>
            <AnimatedConversation messages={messages} loop />
          </div>
        </div>

        {/* input bar */}
        <div className="flex items-center gap-2 border-t border-border/60 px-3 py-3">
          <Plus className="size-5 shrink-0 text-imessage" />
          <div className="flex flex-1 items-center justify-between rounded-full border border-border bg-background px-3 py-1.5">
            <span className="text-[13px] text-muted-foreground">iMessage</span>
            <span className="flex size-6 items-center justify-center rounded-full bg-imessage">
              <ArrowUp className="size-4 text-imessage-foreground" />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
