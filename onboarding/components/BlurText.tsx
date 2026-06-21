"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"

type BlurTextProps = {
  text: string
  className?: string
  /** seconds before the first word animates in */
  delay?: number
  /** seconds between each word */
  stagger?: number
}

// Reveals a line of text word-by-word, each one sharpening from a soft blur.
// Words wrap naturally, so it's safe for multi-line body copy.
export function BlurText({ text, className, delay = 0, stagger = 0.08 }: BlurTextProps) {
  const words = text.split(" ")

  return (
    <span className={cn("inline", className)} aria-label={text}>
      {words.map((word, i) => (
        <span key={i} aria-hidden="true">
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              delay: delay + i * stagger,
              duration: 0.35,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  )
}
