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
  // Collect the essentials ONCE up front so we never have to ask mid-crisis:
  // name, where they live (the ride-home destination), and someone to call.
  const missing: string[] = [];
  if (!profile?.name) missing.push("name");
  if (!profile?.home_address) missing.push("home address (where they live — this is the ride-home destination)");
  if (!friends.some((f) => f.is_emergency)) missing.push("at least one emergency contact");
  return { armed: missing.length === 0, missing };
}
