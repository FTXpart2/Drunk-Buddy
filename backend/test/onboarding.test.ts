import { describe, it, expect } from "vitest";
import { onboardingStatus } from "../src/onboarding/onboarding";

describe("onboardingStatus", () => {
  it("reports the required fields that are still missing", () => {
    const s = onboardingStatus(null, []);
    expect(s.armed).toBe(false);
    expect(s.missing).toContain("name");
    expect(s.missing).toContain("at least one emergency contact");
  });

  it("does not require a home address up front (collected lazily)", () => {
    const s = onboardingStatus(null, []);
    expect(s.missing).not.toContain("home address");
  });

  it("is armed with just a name + an emergency contact (no address needed)", () => {
    const s = onboardingStatus(
      { phone: "+1", name: "Harsh", created_at: 1 },
      [{ name: "Sam", phone: "+2", is_emergency: true }],
    );
    expect(s.armed).toBe(true);
    expect(s.missing).toHaveLength(0);
  });

  it("does not arm on a non-emergency contact alone", () => {
    const s = onboardingStatus(
      { phone: "+1", name: "Harsh", home_address: "221B", created_at: 1 },
      [{ name: "Sam", phone: "+2", is_emergency: false }],
    );
    expect(s.armed).toBe(false);
  });
});
