"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"

export type SplitSegment = {
  /** text run; omit when this segment is just a line break */
  text?: string
  /** classes applied to this run (e.g. the accent words) */
  className?: string
  /** render a responsive line break instead of text */
  br?: boolean
}

type SplitTextProps = {
  segments: SplitSegment[]
  className?: string
  /** seconds before the first character animates in */
  delay?: number
  /** seconds between each character */
  stagger?: number
}

// Animates a heading in character-by-character on mount. Words stay intact
// (each wraps as a unit) while every character shares one continuous stagger
// across the whole line, so styled runs like the accent words line up cleanly.
export function SplitText({ segments, className, delay = 0, stagger = 0.025 }: SplitTextProps) {
  let charIndex = 0
  const label = segments.map((s) => s.text ?? "").join("")

  return (
    <span className={cn("inline", className)} aria-label={label}>
      {segments.map((seg, si) => {
        if (seg.br) return <br key={si} className="hidden sm:block" aria-hidden="true" />
        return (
          <span key={si} className={seg.className} aria-hidden="true">
            {(seg.text ?? "").split(/(\s+)/).map((chunk, ci) => {
              if (/^\s+$/.test(chunk)) return <span key={ci}>{chunk}</span>
              return (
                <span key={ci} className="inline-block whitespace-nowrap">
                  {chunk.split("").map((ch) => {
                    const i = charIndex++
                    return (
                      <motion.span
                        key={i}
                        className="inline-block"
                        initial={{ y: "0.45em", opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{
                          delay: delay + i * stagger,
                          duration: 0.8,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        {ch}
                      </motion.span>
                    )
                  })}
                </span>
              )
            })}
          </span>
        )
      })}
    </span>
  )
}
