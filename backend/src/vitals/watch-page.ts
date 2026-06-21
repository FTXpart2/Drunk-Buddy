// The one-tap page the buddy links in the thread (brief non-negotiable #1: links
// are the only external surface). On a phone browser we CAN'T read the Apple
// Watch directly (iOS has no Web Bluetooth), so this is a polished live monitor
// that auto-streams a controllable vitals signal to /vitals (the brief's
// "simulated stream") plus the phone's live location to /location. A real
// deployment would feed /vitals from HealthKit via an iOS Shortcut / Health Auto
// Export — same endpoint, no page change.
export function watchPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="theme-color" content="#0a0a0f" />
<title>drunk buddy · vitals</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; height:100%; }
  body {
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
    background: radial-gradient(125% 80% at 50% -10%, #1c1033 0%, #0a0a0f 55%);
    color: #f4f4f7; min-height: 100dvh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 22px; padding: 34px 24px; text-align: center;
  }
  .brand { font-size: 12.5px; letter-spacing: .16em; text-transform: uppercase; opacity: .5; }
  .heart-wrap { position: relative; display: grid; place-items: center; width: 200px; height: 200px; }
  .ring { position: absolute; inset: 14px; border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255,76,109,.20), transparent 72%); }
  .heart { font-size: 92px; line-height: 1; filter: drop-shadow(0 8px 26px rgba(255,76,109,.5));
    animation: beat var(--beat, .82s) infinite ease-in-out; }
  @keyframes beat { 0%,100%{transform:scale(1)} 16%{transform:scale(1.19)} 32%{transform:scale(.97)} 48%{transform:scale(1.05)} }
  .bpm { font-size: 78px; font-weight: 800; letter-spacing: -3px; line-height: .9; }
  .bpm small { font-size: 19px; font-weight: 600; opacity: .5; letter-spacing: 0; }
  .state { font-size: 14px; font-weight: 650; padding: 6px 15px; border-radius: 999px;
    background: rgba(127,209,255,.13); color: #9bd9ff; transition: all .3s; }
  .state.hot { background: rgba(255,90,120,.17); color: #ff8da3; }
  .status { font-size: 12.5px; opacity: .55; display: flex; align-items: center; gap: 7px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #43d17a; box-shadow: 0 0 10px #43d17a; transition: background .3s; }
  .controls { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 2px; }
  button { appearance: none; border: 0; border-radius: 14px; padding: 13px 20px; font-size: 15px;
    font-weight: 650; color: #f4f4f7; background: rgba(255,255,255,.08);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); cursor: pointer;
    transition: transform .08s ease, background .15s; }
  button:active { transform: scale(.95); }
  button.spike { background: linear-gradient(135deg, #ff5a6e, #ff2d63); color: #fff; box-shadow: 0 6px 20px rgba(255,45,99,.35); }
  .hint { font-size: 12px; opacity: .42; max-width: 290px; line-height: 1.45; }
</style>
</head>
<body>
  <div class="brand">drunk buddy · watching over you</div>
  <div class="heart-wrap"><div class="ring"></div><div class="heart" id="heart">❤️</div></div>
  <div class="bpm"><span id="bpm">--</span><small> bpm</small></div>
  <div class="state" id="state">connecting…</div>
  <div class="status"><span class="dot" id="dot"></span><span id="status">starting…</span></div>
  <div class="controls">
    <button id="spike" class="spike">simulate spike</button>
    <button id="calm">back to normal</button>
  </div>
  <div class="hint" id="hint">your heart rate &amp; location stream privately to your buddy while this stays open.</div>
<script>
  var params = new URLSearchParams(location.search);
  var token = params.get("t") || "";
  var $ = function (id) { return document.getElementById(id); };
  var hr = 74, target = 74;

  function render() {
    var v = Math.round(hr);
    $("bpm").textContent = v;
    var hot = v >= 130 || (v > 0 && v <= 50);
    $("state").textContent = hot ? (v <= 50 ? "running low — hang tight" : "elevated — i'm watching") : "looking good";
    $("state").classList.toggle("hot", hot);
    $("heart").style.setProperty("--beat", Math.max(0.34, 60 / Math.max(v, 1)).toFixed(2) + "s");
  }

  async function pushHr() {
    if (!token) { $("status").textContent = "missing link — ask your buddy to resend it"; $("dot").style.background = "#ff5a6e"; return; }
    try {
      await fetch("/vitals", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, hr: Math.round(hr), motion: 0 }) });
      $("status").textContent = "live · synced " + new Date().toLocaleTimeString();
      $("dot").style.background = "#43d17a";
    } catch (e) { $("status").textContent = "reconnecting…"; $("dot").style.background = "#e0b341"; }
  }

  // smooth, lifelike heartbeat that eases toward a target; streamed every 3s
  setInterval(function () { hr += (target - hr) * 0.22 + (Math.random() - 0.5) * 1.4; render(); }, 250);
  setInterval(pushHr, 3000);
  render(); pushHr();

  $("spike").onclick = function () { target = 152; $("hint").textContent = "spike sent — your buddy's about to check on you."; };
  $("calm").onclick = function () { target = 74; $("hint").textContent = "back to normal. nice."; };

  // share live location over https (the Uber pickup + the emergency map pin)
  if (navigator.geolocation && token) {
    var sendLoc = function (p) {
      fetch("/location", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, lat: p.coords.latitude, lon: p.coords.longitude }) }).catch(function () {});
    };
    navigator.geolocation.getCurrentPosition(sendLoc, function () {}, { enableHighAccuracy: true });
    navigator.geolocation.watchPosition(sendLoc, function () {}, { enableHighAccuracy: true, maximumAge: 30000 });
  }
</script>
</body>
</html>`;
}
