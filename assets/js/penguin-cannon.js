/* ==========================================================================
   Penguin Cannon — a one-button arcade launch game on HTML5 Canvas.

   Loop:  ATTRACT (insert coin) -> AIM (lock angle) -> POWER (lock power, fire)
          -> FLIGHT (flap + bounce + grab bonus targets) -> REST (score) -> ...

   One action drives everything: tap / click the stage, or press Space/Enter.
   No external assets — all art is drawn with canvas primitives, audio is
   synthesized with WebAudio, and progress is saved in localStorage.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var W = canvas.width;   // 1280
  var H = canvas.height;  // 720

  // ----------------------------------------------------------- world constants
  var GROUND_Y   = 600;   // y of the snow surface (world space)
  var CANNON_X   = 95;    // cannon pivot x (world space)
  var PIVOT_Y    = GROUND_Y - 40;
  var PPM        = 10;     // pixels per metre
  var GRAV       = 0.42;
  var MAX_LAUNCH = 33;     // launch speed at 100% power
  var RESTITUTION = 0.46;  // vertical bounce energy kept
  var FRICTION    = 0.84;  // horizontal speed kept per bounce
  var PENGUIN_R   = 18;
  var FLAP_VY     = -8.2;  // upward impulse per flap
  var FLAP_VX     = 1.4;
  var FLAPS_START = 3;
  var START_COINS = 5;
  var REFILL_COINS = 5;

  // ----------------------------------------------------------------- storage
  function load(key, def) {
    var v = parseInt(localStorage.getItem(key), 10);
    return isNaN(v) ? def : v;
  }
  var coins = load("pc_coins", START_COINS);
  var best  = load("pc_best", 0);
  function saveCoins() { localStorage.setItem("pc_coins", coins); }
  function saveBest()  { localStorage.setItem("pc_best", best); }

  // ------------------------------------------------------------------- state
  var STATE = { ATTRACT: 0, AIM: 1, POWER: 2, FLIGHT: 3, REST: 4, BROKE: 5 };
  var state = STATE.ATTRACT;

  var angleDeg = 45, angleDir = 1;     // AIM oscillation (18..78)
  var power = 0, powerDir = 1;         // POWER oscillation (0..100)
  var peng = { x: CANNON_X, y: PIVOT_Y, vx: 0, vy: 0, rot: 0, rotV: 0 };
  var flaps = 0;
  var cam = { x: 0 };
  var maxDist = 0, lastDist = 0, lastReward = 0, newBest = false;
  var blink = 0;
  var muted = false;

  // bonus targets scattered along the flight path (taken-state reset per throw)
  var targets = [];
  (function buildTargets() {
    for (var i = 0; i < 22; i++) {
      targets.push({
        x: 430 + i * 340 + (i * 53 % 90),
        y: GROUND_Y - (110 + (i * 71 % 260)),
        r: 24,
        taken: false
      });
    }
  })();

  // ambient snow (screen space)
  var snow = [];
  for (var s = 0; s < 70; s++) {
    snow.push({ x: Math.random() * W, y: Math.random() * H,
                vx: -0.3 - Math.random() * 0.5, vy: 0.4 + Math.random() * 0.9,
                r: 1 + Math.random() * 2 });
  }

  // ------------------------------------------------------------------- audio
  var actx = null;
  function beep(freq, dur, type, vol) {
    if (muted) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "square";
      o.frequency.value = freq;
      g.gain.value = vol || 0.05;
      o.connect(g); g.connect(actx.destination);
      var t = actx.currentTime;
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch (e) { /* audio optional */ }
  }
  var sfx = {
    coin: function () { beep(880, 0.08, "square", 0.05); setTimeout(function () { beep(1320, 0.1, "square", 0.05); }, 70); },
    fire: function () { beep(180, 0.22, "sawtooth", 0.07); },
    flap: function () { beep(520, 0.07, "square", 0.04); },
    land: function () { beep(120, 0.12, "sine", 0.06); },
    nope: function () { beep(140, 0.18, "square", 0.05); }
  };

  // ---------------------------------------------------------------- helpers
  function rad(d) { return d * Math.PI / 180; }
  function muzzle() {
    var r = rad(angleDeg);
    return { x: CANNON_X + Math.cos(r) * 46, y: PIVOT_Y - Math.sin(r) * 46, r: r };
  }

  // ------------------------------------------------------- state transitions
  function resetForAim() {
    var m = muzzle();
    peng.x = m.x; peng.y = m.y; peng.vx = 0; peng.vy = 0; peng.rot = -rad(angleDeg);
    cam.x = 0;
    angleDeg = 25; angleDir = 1;
    for (var i = 0; i < targets.length; i++) targets[i].taken = false;
  }

  function insertCoin() {
    if (coins <= 0) { state = STATE.BROKE; sfx.nope(); return; }
    coins--; saveCoins(); sfx.coin();
    resetForAim();
    state = STATE.AIM;
  }

  function fire() {
    var m = muzzle();
    var v = MAX_LAUNCH * (power / 100);
    peng.x = m.x; peng.y = m.y;
    peng.vx = Math.cos(m.r) * v;
    peng.vy = -Math.sin(m.r) * v;
    peng.rotV = 0.16 + v * 0.004;
    flaps = FLAPS_START;
    maxDist = 0; newBest = false;
    sfx.fire();
    state = STATE.FLIGHT;
  }

  function endThrow() {
    lastDist = Math.round(maxDist);
    lastReward = Math.floor(lastDist / 55);   // milestone refund
    if (lastReward > 0) { coins += lastReward; saveCoins(); }
    if (lastDist > best) { best = lastDist; saveBest(); newBest = true; }
    sfx.land();
    state = STATE.REST;
  }

  // the single universal input
  function action() {
    switch (state) {
      case STATE.ATTRACT: insertCoin(); break;
      case STATE.AIM:     power = 0; powerDir = 1; state = STATE.POWER; break;
      case STATE.POWER:   fire(); break;
      case STATE.FLIGHT:
        if (flaps > 0) { flaps--; peng.vy += FLAP_VY; peng.vx += FLAP_VX; sfx.flap(); }
        break;
      case STATE.REST:    state = STATE.ATTRACT; break;
      case STATE.BROKE:   coins = REFILL_COINS; saveCoins(); sfx.coin(); state = STATE.ATTRACT; break;
    }
  }

  // --------------------------------------------------------------- update
  function update(dt) {
    blink += dt;
    // drift snow
    for (var i = 0; i < snow.length; i++) {
      var f = snow[i];
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
      if (f.x < -4) f.x = W + 4;
    }

    if (state === STATE.AIM) {
      angleDeg += angleDir * 0.9 * dt;
      if (angleDeg > 78) { angleDeg = 78; angleDir = -1; }
      if (angleDeg < 18) { angleDeg = 18; angleDir = 1; }
      var m = muzzle(); peng.x = m.x; peng.y = m.y; peng.rot = -m.r;
    } else if (state === STATE.POWER) {
      power += powerDir * 2.4 * dt;
      if (power > 100) { power = 100; powerDir = -1; }
      if (power < 0)   { power = 0;   powerDir = 1; }
      var mp = muzzle(); peng.x = mp.x; peng.y = mp.y; peng.rot = -mp.r;
    } else if (state === STATE.FLIGHT) {
      peng.vy += GRAV * dt;
      peng.x += peng.vx * dt;
      peng.y += peng.vy * dt;
      peng.rot += peng.rotV * dt;

      var floor = GROUND_Y - PENGUIN_R;
      if (peng.y >= floor) {
        peng.y = floor;
        if (peng.vy > 1.2) {            // skip like a stone
          peng.vy = -peng.vy * RESTITUTION;
          peng.vx *= FRICTION;
          peng.rotV *= 0.7;
          sfx.land();
        } else {
          peng.vy = 0;
          peng.vx *= 0.90;              // slide to a halt
          peng.rotV *= 0.8;
        }
      }

      cam.x = Math.max(0, peng.x - W * 0.32);

      var d = (peng.x - CANNON_X) / PPM;
      if (d > maxDist) maxDist = d;

      // grab bonus targets
      for (var t = 0; t < targets.length; t++) {
        var tg = targets[t];
        if (tg.taken) continue;
        var dx = peng.x - tg.x, dy = peng.y - tg.y;
        if (dx * dx + dy * dy < (tg.r + PENGUIN_R) * (tg.r + PENGUIN_R)) {
          tg.taken = true; coins++; saveCoins(); sfx.coin();
        }
      }

      var onGround = peng.y >= floor - 0.5;
      if (onGround && Math.abs(peng.vx) < 0.4 && Math.abs(peng.vy) < 1.2) endThrow();
    } else if (state === STATE.ATTRACT || state === STATE.BROKE) {
      cam.x += (0 - cam.x) * 0.1 * dt;   // glide camera home
      if (Math.abs(cam.x) < 0.5) cam.x = 0;
      var ma = muzzle(); peng.x = ma.x; peng.y = ma.y; peng.rot = -ma.r;
    }
  }

  // --------------------------------------------------------------- drawing
  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, "#0a0f24");
    g.addColorStop(0.6, "#1a2a54");
    g.addColorStop(1, "#34548c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // moon (screen-fixed)
    ctx.fillStyle = "#f4f7ff";
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(W - 150, 110, 42, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // stars (deterministic-ish, faint parallax)
    ctx.fillStyle = "#cdd6ff";
    for (var i = 0; i < 60; i++) {
      var sx = ((i * 197) % W) - (cam.x * 0.05) % W;
      if (sx < 0) sx += W;
      var sy = (i * 89) % (GROUND_Y - 120);
      ctx.globalAlpha = 0.4 + ((i * 7) % 6) / 10;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawRange(factor, baseY, h, color) {
    // repeating mountain silhouette with parallax
    ctx.fillStyle = color;
    var span = 360, off = (cam.x * factor) % span;
    ctx.beginPath();
    ctx.moveTo(-off - span, baseY);
    for (var x = -off - span; x < W + span; x += span) {
      ctx.lineTo(x + span * 0.5, baseY - h);
      ctx.lineTo(x + span, baseY);
    }
    ctx.lineTo(W + span, GROUND_Y);
    ctx.lineTo(-off - span, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround() {
    var g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    g.addColorStop(0, "#eef4ff");
    g.addColorStop(1, "#c4d2ec");
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // distance markers every 50 m
    ctx.save();
    ctx.translate(-cam.x, 0);
    ctx.fillStyle = "#6b7aa0";
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    var startM = Math.floor((cam.x / PPM) / 50) * 50;
    for (var m = Math.max(0, startM); m * PPM < cam.x + W + 50; m += 50) {
      var wx = CANNON_X + m * PPM;
      ctx.fillRect(wx - 1, GROUND_Y, 2, 12);
      if (m > 0) ctx.fillText(m + "m", wx, GROUND_Y + 30);
    }
    ctx.restore();
  }

  function drawCannon() {
    ctx.save();
    ctx.translate(CANNON_X - cam.x, 0);
    // platform + wheel
    ctx.fillStyle = "#3a3050";
    ctx.fillRect(-34, GROUND_Y - 18, 68, 18);
    ctx.fillStyle = "#5a4a78";
    ctx.beginPath(); ctx.arc(0, GROUND_Y - 12, 16, 0, Math.PI * 2); ctx.fill();
    // barrel
    var r = rad(angleDeg);
    var ex = Math.cos(r) * 56, ey = -Math.sin(r) * 56;
    ctx.strokeStyle = "#9aa6c8";
    ctx.lineWidth = 22; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, PIVOT_Y);
    ctx.lineTo(ex, PIVOT_Y + ey);
    ctx.stroke();
    ctx.strokeStyle = "#6a7398"; ctx.lineWidth = 22;
    ctx.beginPath(); ctx.moveTo(0, PIVOT_Y); ctx.lineTo(ex * 0.35, PIVOT_Y + ey * 0.35); ctx.stroke();
    ctx.restore();
  }

  function drawPenguin(cx, cy, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    // body
    ctx.fillStyle = "#1b1b28";
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 19, 0, 0, Math.PI * 2); ctx.fill();
    // belly
    ctx.fillStyle = "#f4f7ff";
    ctx.beginPath(); ctx.ellipse(2, 2, 9, 13, 0, 0, Math.PI * 2); ctx.fill();
    // feet
    ctx.fillStyle = "#f4a72c";
    ctx.beginPath(); ctx.ellipse(-6, 17, 6, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(7, 17, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    // beak
    ctx.beginPath(); ctx.moveTo(13, -4); ctx.lineTo(24, -1); ctx.lineTo(13, 3); ctx.closePath(); ctx.fill();
    // eye
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(8, -7, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(9, -7, 2, 0, Math.PI * 2); ctx.fill();
    // scarf
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(-10, 4, 20, 4);
    ctx.restore();
  }

  function drawTargets() {
    ctx.save();
    ctx.translate(-cam.x, 0);
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.taken) continue;
      if (t.x < cam.x - 40 || t.x > cam.x + W + 40) continue;
      var pulse = 1 + Math.sin(blink * 0.15 + i) * 0.08;
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 20px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🪙", t.x, t.y + 1);
    }
    ctx.restore();
    ctx.textBaseline = "alphabetic";
  }

  function drawAimGuide() {
    // dotted preview of the launch direction from the muzzle
    var m = muzzle();
    var v = MAX_LAUNCH * (state === STATE.POWER ? power / 100 : 0.6);
    var vx = Math.cos(m.r) * v, vy = -Math.sin(m.r) * v;
    var x = m.x, y = m.y;
    ctx.fillStyle = "#ffffffaa";
    for (var i = 1; i <= 18; i++) {
      x += vx; y += vy; vy += GRAV;
      if (y > GROUND_Y) break;
      if (i % 2 === 0) {
        ctx.beginPath(); ctx.arc(x - cam.x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ---- HUD ----
  function text(str, x, y, size, color, align, glow) {
    ctx.font = "bold " + size + "px monospace";
    ctx.textAlign = align || "left";
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  }

  function drawHUD() {
    // top bar
    text("🪙 " + coins, 24, 40, 26, "#fde047", "left");
    text("BEST " + best + "m", W - 24, 40, 26, "#22d3ee", "right");

    if (state === STATE.ATTRACT) {
      if (Math.floor(blink / 24) % 2 === 0)
        text("INSERT COIN", W / 2, H / 2 - 30, 56, "#f472b6", "center", 18);
      text("TAP  /  SPACE  to play", W / 2, H / 2 + 20, 24, "#e6e6f0", "center");
      text("aim · power · fire · flap in the air for distance", W / 2, H / 2 + 56, 18, "#8a8ab0", "center");
    } else if (state === STATE.AIM) {
      text("ANGLE  " + Math.round(angleDeg) + "°", W / 2, 60, 30, "#a3e635", "center", 10);
      text("TAP / SPACE to LOCK ANGLE", W / 2, H - 36, 22, "#e6e6f0", "center");
    } else if (state === STATE.POWER) {
      // power meter
      var bw = 420, bx = (W - bw) / 2, by = H - 70, bh = 26;
      ctx.fillStyle = "#00000055"; ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
      var grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grd.addColorStop(0, "#a3e635"); grd.addColorStop(0.6, "#fde047"); grd.addColorStop(1, "#f472b6");
      ctx.fillStyle = grd; ctx.fillRect(bx, by, bw * (power / 100), bh);
      ctx.strokeStyle = "#e6e6f0"; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
      text("POWER", W / 2, by - 14, 22, "#fde047", "center");
      text("TAP / SPACE to FIRE!", W / 2, 60, 28, "#f472b6", "center", 12);
    } else if (state === STATE.FLIGHT) {
      text(Math.round(maxDist) + " m", W / 2, 70, 48, "#fff", "center", 14);
      var fl = ""; for (var i = 0; i < flaps; i++) fl += "🐧";
      text(flaps > 0 ? "FLAP " + fl : "no flaps left", W / 2, 110, 22,
           flaps > 0 ? "#22d3ee" : "#8a8ab0", "center");
    } else if (state === STATE.REST) {
      text("DISTANCE", W / 2, H / 2 - 70, 26, "#8a8ab0", "center");
      text(lastDist + " m", W / 2, H / 2 - 16, 64, "#22d3ee", "center", 16);
      if (newBest) text("★ NEW BEST! ★", W / 2, H / 2 + 30, 28, "#fde047", "center", 14);
      if (lastReward > 0) text("+" + lastReward + " 🪙 bonus", W / 2, H / 2 + 68, 24, "#a3e635", "center");
      text("TAP / SPACE to play again", W / 2, H - 40, 22, "#e6e6f0", "center");
    } else if (state === STATE.BROKE) {
      text("OUT OF COINS", W / 2, H / 2 - 20, 52, "#f472b6", "center", 16);
      text("TAP / SPACE for a FREE refill", W / 2, H / 2 + 30, 24, "#e6e6f0", "center");
    }

    if (muted) text("🔇 muted (M)", 24, H - 20, 16, "#8a8ab0", "left");
  }

  function drawSnow() {
    ctx.fillStyle = "#ffffffcc";
    for (var i = 0; i < snow.length; i++) {
      var f = snow[i];
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function render() {
    drawSky();
    drawRange(0.2, GROUND_Y, 220, "#1c2a52");
    drawRange(0.45, GROUND_Y, 140, "#2a3f70");
    drawGround();
    drawTargets();
    if (state === STATE.AIM || state === STATE.POWER) drawAimGuide();
    drawCannon();
    drawPenguin(peng.x - cam.x, peng.y, peng.rot);
    drawSnow();
    drawHUD();
  }

  // ----------------------------------------------------------------- loop
  var last = performance.now();
  function frame(now) {
    var dt = (now - last) / 16.667;       // ~1 at 60fps
    last = now;
    if (dt > 3) dt = 3;                    // clamp after tab-switch
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ----------------------------------------------------------------- input
  canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); action(); });
  window.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowUp") {
      e.preventDefault(); action();
    } else if (e.code === "KeyM") {
      muted = !muted;
    }
  });
})();
