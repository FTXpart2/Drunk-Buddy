// Domain model. Phone number (handle.address from the webhook) is the join key
// across everything — see the Redis keys in CLAUDE.md / PLAN.md.

export interface UserProfile {
  phone: string;
  name?: string;
  home_address?: string;
  rideshare?: string;
  created_at: number;
}

export interface Friend {
  name: string;
  phone: string;
  is_emergency: boolean;
}

export interface PartyMode {
  active: boolean;
  started_at?: number;
  end_time?: number;
}

export interface VitalsTick {
  ts: number;
  hr: number;
  hrv: number;
  motion: number;
}

export interface MemoryItem {
  ts: number;
  fact: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
