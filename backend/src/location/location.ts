import type { Request, Response } from "express";
import type { Store } from "../store/store";
import { verifyHealthToken } from "../vitals/link";
import { log } from "../log";

// Reverse-geocode coords to a clean address and store them as the user's live
// location. Shared by POST /location (watch page) AND the iMessage "Send My
// Current Location" pin (channel parses the vCard -> these coords).
export async function resolveAndStoreLocation(
  store: Store,
  phone: string,
  lat: number,
  lon: number,
): Promise<string | undefined> {
  let address: string | undefined;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lon}`,
      { headers: { "User-Agent": "drunk-buddy/1.0" } },
    );
    if (r.ok) {
      const j = (await r.json()) as { display_name?: string; address?: Record<string, string> };
      // SHORT, autocomplete-friendly ("1939 Henry St, Berkeley, CA"). The full
      // Nominatim display_name (…Alameda County, 94104, United States) breaks
      // Uber's address search — it can't match it, so it picks a wrong place.
      address = cleanAddress(j.address) ?? j.display_name;
    }
  } catch {
    // best-effort: coords alone still give us a map pin
  }
  await store.setLocation(phone, { lat, lon, address, ts: Date.now() });
  return address;
}

// POST /location — the watch page pushes the phone's live coordinates (same
// signed health token as /vitals).
export function createLocationHandler(store: Store) {
  return async (req: Request, res: Response) => {
    res.sendStatus(200); // ack immediately; process async
    const body: any = req.body ?? {};
    const phone = verifyHealthToken(String(req.query.t ?? body.t ?? ""));
    const lat = Number(body.lat ?? req.query.lat);
    const lon = Number(body.lon ?? req.query.lon);
    if (!phone || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      log("location.reject", { hasPhone: !!phone });
      return;
    }
    const address = await resolveAndStoreLocation(store, phone, lat, lon);
    log("location.update", { phone, address: address ?? `${lat},${lon}` });
  };
}

// Turn Nominatim's verbose address object into a clean "house road, city, ST"
// string that a ride app's autocomplete actually resolves to one good result.
function cleanAddress(a?: Record<string, string>): string | undefined {
  if (!a) return undefined;
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || a.hamlet || a.suburb || a.neighbourhood;
  const state = a["ISO3166-2-lvl4"]?.split("-")[1] || a.state; // "US-CA" -> "CA"
  const out = [street, city, state].filter(Boolean).join(", ");
  return out || undefined;
}
