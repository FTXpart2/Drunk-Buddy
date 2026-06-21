import { cn } from "@/lib/utils"

type BubbleProps = {
  from?: "buddy" | "you"
  children: React.ReactNode
  className?: string
  tail?: boolean
}

export function Bubble({ from = "buddy", children, className, tail = true }: BubbleProps) {
  const isYou = from === "you"
  return (
    <div className={cn("flex w-full", isYou ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[80%] rounded-3xl px-4 py-2.5 text-[15px] leading-snug",
          isYou
            ? "rounded-br-md bg-imessage text-imessage-foreground"
            : "rounded-bl-md bg-bubble text-bubble-foreground",
          className,
        )}
      >
        {children}
        {tail && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute bottom-0 h-3 w-3",
              isYou
                ? "-right-1 bg-imessage [clip-path:path('M0,0_C0,8_4,12_12,12_C6,12_0,8_0,0')]"
                : "-left-1 bg-bubble [clip-path:path('M12,0_C12,8_8,12_0,12_C6,12_12,8_12,0')]",
            )}
          />
        )}
      </div>
    </div>
  )
}

export function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-3xl rounded-bl-md bg-bubble px-4 py-3">
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60" />
      </div>
    </div>
  )
}

export function ChatTimestamp({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
      {children}
    </div>
  )
}
