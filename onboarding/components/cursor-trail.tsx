"use client"

import TextCursor from "@/components/TextCursor"

// Page-wide beer trail. Fixed to the viewport so it follows the cursor as you
// scroll the whole site; pointer-events-none so it never blocks clicks.
export function CursorTrail() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <TextCursor text="🍻" spacing={80} maxPoints={8} exitDuration={0.6} />
    </div>
  )
}
