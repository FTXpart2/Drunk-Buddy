"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { Bubble, TypingBubble } from "@/components/chat"
import { cn } from "@/lib/utils"

export type ChatMessage = {
  from: "buddy" | "you"
  node: React.ReactNode
}

type Props = {
  messages: ChatMessage[]
  className?: string
  /** delay before the first message starts, in ms */
  startDelay?: number
  /** replay the whole thread on a loop */
  loop?: boolean
}

// Plays a conversation out one message at a time once it scrolls into view —
// the buddy "types" for a beat before each of its replies, like a live thread.
export function AnimatedConversation({ messages, className, startDelay = 650, loop = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)
  const [shown, setShown] = useState(0)
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return

    if (shown >= messages.length) {
      setTyping(false)
      if (!loop) return
      // restart the thread after a pause
      const restart = setTimeout(() => setShown(0), 2600)
      return () => clearTimeout(restart)
    }

    const gap = shown === 0 ? startDelay : 750
    const next = messages[shown]
    const timers: ReturnType<typeof setTimeout>[] = []

    if (next.from === "buddy") {
      // pause, then "type" for a beat, then the reply lands
      timers.push(setTimeout(() => setTyping(true), gap))
      timers.push(
        setTimeout(() => {
          setTyping(false)
          setShown((n) => n + 1)
        }, gap + 1400),
      )
    } else {
      timers.push(setTimeout(() => setShown((n) => n + 1), gap))
    }
    return () => timers.forEach(clearTimeout)
  }, [started, shown, messages, startDelay, loop])

  return (
    <div ref={ref} className={cn("flex flex-col gap-2.5", className)}>
      {messages.slice(0, shown).map((m, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <Bubble from={m.from}>{m.node}</Bubble>
        </motion.div>
      ))}
      {typing && (
        <motion.div
          initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <TypingBubble />
        </motion.div>
      )}
    </div>
  )
}
