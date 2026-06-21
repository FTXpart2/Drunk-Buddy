import type { Request, Response } from "express";
import type { VitalsTick } from "@drunk-buddy/shared";
import type { Store } from "../store/store";
import type { Guardian } from "./guardian";
import { verifyHealthToken } from "./link";
import { log } from "../log";

// POST /vitals — where the user's phone pushes heart rate (iOS Shortcut, Health
// Auto Export, or the /watch page). Shortcut-friendly: token may ride in the
// `?t=` query OR the JSON body; hr is coerced (Shortcuts often sends strings).
export function createVitalsHandler(store: Store, guardian: Guardian) {
  return (req: Request, res: Response) => {
    res.sendStatus(200); // ack immediately; process async
    const body: any = req.body ?? {};
    const phone = verifyHealthToken(String(req.query.t ?? body.t ?? ""));
    const hr = Number(body.hr ?? req.query.hr);
    if (!phone || !Number.isFinite(hr) || hr <= 0) {
      log("vitals.reject", { hasPhone: !!phone, hr: body.hr ?? req.query.hr });
      return;
    }
    const tick: VitalsTick = {
      ts: Date.now(),
      hr,
      hrv: Number(body.hrv ?? 0),
      motion: Number(body.motion ?? 0),
    };
    void store
      .pushVitals(phone, tick)
      .then(() => guardian.onTick(phone, tick))
      .catch((e) => log("vitals.error", { err: String(e) }));
  };
}
