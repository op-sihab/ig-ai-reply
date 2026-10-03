"""Probe the live control panel in a real Chrome over CDP.

Answers the questions a screenshot alone cannot: are the background blobs
actually rendered, where are they, what is painted on top of them, and what
theme/variables won. Also saves a true viewport screenshot.

    python probe_panel.py "<panel url>" [out.png]

Needs a Python with websocket-client (the Hermes venv does not have it; the
system Python 3.11 does).
"""
import base64
import json
import subprocess
import sys
import time
import urllib.request

import websocket  # websocket-client

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9334

PROBE_JS = r"""
(() => {
  const out = {
    theme: document.documentElement.getAttribute('data-theme'),
    winH: innerHeight, winW: innerWidth,
    docH: document.documentElement.scrollHeight,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    vars: {
      glass: getComputedStyle(document.documentElement).getPropertyValue('--glass').trim(),
      drop: getComputedStyle(document.documentElement).getPropertyValue('--drop').trim()
    },
    blobs: [], scene: null, stackAtB1: null, grain: null
  };
  const scene = document.querySelector('.scene');
  if (scene) {
    const r = scene.getBoundingClientRect(), cs = getComputedStyle(scene);
    out.scene = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                  pos: cs.position, z: cs.zIndex, display: cs.display, vis: cs.visibility, op: cs.opacity };
  }
  document.querySelectorAll('.blob').forEach((e, n) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    out.blobs.push({ n: n, cls: String(e.className), x: Math.round(r.x), y: Math.round(r.y),
                     w: Math.round(r.width), h: Math.round(r.height), op: cs.opacity,
                     filter: cs.filter, display: cs.display, vis: cs.visibility,
                     bg: cs.backgroundImage.slice(0, 70) });
  });
  const g = document.querySelector('.grain');
  if (g) { const cs = getComputedStyle(g);
    out.grain = { z: cs.zIndex, pos: cs.position, op: cs.opacity, blend: cs.mixBlendMode }; }
  const b = document.querySelector('.b1');
  if (b) {
    const r = b.getBoundingClientRect();
    const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
    out.stackAtB1 = { x: x, y: y,
      stack: document.elementsFromPoint(x, y).slice(0, 6).map(e => String(e.className || e.tagName)) };
  }
  return out;
})()
"""


def main():
    url = sys.argv[1]
    out_png = sys.argv[2] if len(sys.argv) > 2 else "panel_probe.png"
    proc = subprocess.Popen([
        CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
        "--remote-allow-origins=*", "--remote-debugging-port=%d" % PORT,
        "--window-size=390,1150", url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    ws_url = None
    for _ in range(80):
        try:
            data = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json/list" % PORT, timeout=2))
            pages = [t for t in data if t.get("type") == "page" and t.get("webSocketDebuggerUrl")]
            if pages:
                ws_url = pages[0]["webSocketDebuggerUrl"]
                break
        except Exception:
            pass
        time.sleep(0.5)
    if not ws_url:
        proc.kill()
        print(json.dumps({"error": "no CDP page target"}))
        return 1

    ws = websocket.create_connection(ws_url, timeout=25)
    counter = {"n": 0}

    def cmd(method, **params):
        counter["n"] += 1
        mid = counter["n"]
        ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == mid:
                return msg

    cmd("Page.enable")
    # Emulate a real phone: without this, the headless layout viewport is whatever
    # the window ends up being (not the --window-size), so vw/vh differ from the
    # phone and the capture crops the right-hand side.
    cmd("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
    time.sleep(5)  # let the page load, run its fetch and paint

    res = cmd("Runtime.evaluate", expression=PROBE_JS, returnByValue=True)
    probe = res.get("result", {}).get("result", {}).get("value")
    print(json.dumps(probe, indent=2, ensure_ascii=False))

    shot = cmd("Page.captureScreenshot", format="png", captureBeyondViewport=False)
    data = shot.get("result", {}).get("data")
    if data:
        with open(out_png, "wb") as fh:
            fh.write(base64.b64decode(data))
        print("\nscreenshot: " + out_png)

    ws.close()
    proc.kill()
    return 0


if __name__ == "__main__":
    sys.exit(main())
