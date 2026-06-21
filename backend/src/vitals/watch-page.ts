// The web page the buddy links one-tap in the thread (brief non-negotiable #1:
// links are the only external surface). It streams live HR to /vitals via Web
// Bluetooth (BLE Heart Rate Service 0x180D) while open — and offers a manual /
// "simulate spike" control for iOS Safari (no Web Bluetooth) and demos.
export function watchPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<title>drunk buddy · heart watch</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    background:#0b0b10; color:#f4f4f7; min-height:100vh;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px; padding:28px; }
  h1 { font-size:18px; font-weight:600; margin:0; opacity:.85; }
  .hr { font-size:84px; font-weight:800; line-height:1; letter-spacing:-2px; }
  .hr span { font-size:22px; font-weight:600; opacity:.6; }
  .pulse { color:#ff5a78; animation:beat 1s infinite ease-in-out; }
  @keyframes beat { 0%,100%{transform:scale(1)} 14%{transform:scale(1.14)} 28%{transform:scale(1)} }
  .status { min-height:22px; font-size:14px; opacity:.7; text-align:center; }
  button { appearance:none; border:0; border-radius:999px; padding:14px 22px; font-size:16px;
    font-weight:600; color:#0b0b10; background:#7fd1ff; cursor:pointer; }
  button.ghost { background:#23232e; color:#f4f4f7; }
  .row { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
  input[type=range] { width:220px; }
  .manual { display:flex; flex-direction:column; align-items:center; gap:8px; opacity:.9; }
</style>
</head>
<body>
  <h1>drunk buddy is watching 💙</h1>
  <div class="hr" id="hr">--<span> bpm</span></div>
  <div class="status" id="status">tap connect to share your heart rate</div>
  <div class="row">
    <button id="connect">connect watch</button>
  </div>
  <div class="manual">
    <input type="range" id="slider" min="30" max="180" value="78" />
    <div class="row">
      <button class="ghost" id="send">send this bpm</button>
      <button class="ghost" id="spike">simulate spike</button>
    </div>
  </div>
<script>
  const params = new URLSearchParams(location.search);
  const token = params.get("t") || "";
  const hrEl = document.getElementById("hr");
  const statusEl = document.getElementById("status");
  const slider = document.getElementById("slider");

  function paint(hr) {
    hrEl.innerHTML = hr + "<span> bpm</span>";
    hrEl.classList.toggle("pulse", hr > 0);
  }

  async function post(hr) {
    if (!token) { statusEl.textContent = "missing link token — ask your buddy to resend the link"; return; }
    paint(hr);
    try {
      const r = await fetch("/vitals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, hr }),
      });
      statusEl.textContent = r.ok ? "synced · " + new Date().toLocaleTimeString() : "sync failed (" + r.status + ")";
    } catch (e) {
      statusEl.textContent = "offline — can't reach buddy";
    }
  }

  // Share live location so the buddy can set the Uber pickup + drop an alert pin.
  async function postLocation(lat, lon) {
    if (!token) return;
    try {
      await fetch("/location", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, lat, lon }),
      });
    } catch (e) {}
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => postLocation(p.coords.latitude, p.coords.longitude),
      () => {},
      { enableHighAccuracy: true },
    );
    navigator.geolocation.watchPosition(
      (p) => postLocation(p.coords.latitude, p.coords.longitude),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000 },
    );
  }

  document.getElementById("send").onclick = () => post(Number(slider.value));
  document.getElementById("spike").onclick = () => { slider.value = 150; post(150); };
  slider.oninput = () => paint(Number(slider.value));

  document.getElementById("connect").onclick = async () => {
    if (!navigator.bluetooth) {
      statusEl.textContent = "this browser can't read the watch directly — use the slider below";
      return;
    }
    try {
      statusEl.textContent = "pairing…";
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }] });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService("heart_rate");
      const ch = await service.getCharacteristic("heart_rate_measurement");
      await ch.startNotifications();
      statusEl.textContent = "connected · streaming live";
      ch.addEventListener("characteristicvaluechanged", (ev) => {
        const v = ev.target.value;
        const flags = v.getUint8(0);
        const hr = flags & 0x1 ? v.getUint16(1, true) : v.getUint8(1);
        post(hr);
      });
    } catch (e) {
      statusEl.textContent = "couldn't connect — use the slider below";
    }
  };
</script>
</body>
</html>`;
}
