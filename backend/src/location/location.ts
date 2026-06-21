import type { Request, Response } from "express";
import type { Store } from "../store/store";
import { verifyHealthToken } from "../vitals/link";
import { log } from "../log";

// POST /location — the watch page pushes the phone's live coordinates (same
// signed health token as /vitals). We reverse-geocode to a street address
// (OpenStreetMap Nominatim, no key) so the buddy can use it as the Uber pickup
// and drop a maps pin when it alerts the user's emergency contact.
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
    let address: string | undefined;
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
        { headers: { "User-Agent": "drunk-buddy/1.0" } },
      );
      if (r.ok) address = ((await r.json()) as { display_name?: string }).display_name;
    } catch {
      // best-effort: coords alone still give us a map pin
    }
    await store.setLocation(phone, { lat, lon, address, ts: Date.now() });
    log("location.update", { phone, address: address ?? `${lat},${lon}` });
  };
}
