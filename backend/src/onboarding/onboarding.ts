import type { UserProfile, Friend } from "@drunk-buddy/shared";

// In-thread onboarding (brief §8): the buddy is "armed" once it knows the
// minimum it needs to actually help — name, home address, and one emergency
// contact. Blocklist is nice-to-have, collected conversationally afterward.
export interface OnboardingStatus {
  armed: boolean;
  missing: string[];
}

export function onboardingStatus(
  profile: UserProfile | null,
  friends: Friend[],
): OnboardingStatus {
  // Keep the bar LOW so onboarding is fast: just a name + someone to call.
  // Home address is collected lazily (only when actually sending a ride), so we
  // never badger for an exact street address up front.
  const missing: string[] = [];
  if (!profile?.name) missing.push("name");
  if (!friends.some((f) => f.is_emergency)) missing.push("at least one emergency contact");
  return { armed: missing.length === 0, missing };
}
