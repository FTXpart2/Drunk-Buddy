// The buddy's iMessage handle — an Apple ID EMAIL (all texts route here through
// BlueBubbles). Hardcoded so the site works out of the box; override per-deploy
// with NEXT_PUBLIC_BUDDY_HANDLE if it ever changes.
export const BUDDY_HANDLE = process.env.NEXT_PUBLIC_BUDDY_HANDLE || "katikati806@gmail.com";

// Try to open Messages straight to the buddy with a prefilled first text. iOS is
// finicky deep-linking an EMAIL handle here — if a device won't, the vCard below
// is the reliable path (it saves the named "Drunk Buddy" contact, then Message it).
export const messageBuddyHref = `sms:${BUDDY_HANDLE}&body=${encodeURIComponent("hey")}`;

// Downloads a contact card named "Drunk Buddy" wired to the email → on iOS it
// previews the contact with a Message button that opens iMessage to the buddy.
export const addBuddyHref = "/drunk-buddy.vcf";
