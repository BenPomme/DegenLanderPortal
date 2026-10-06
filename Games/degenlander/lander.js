/* ===========================================================================
   DEGEN LANDER: simulation engine

   A rewrite of the original Degenlander. The old version incremented position by
   a fixed amount every frame with no delta-time (so it ran 2.4x faster on a
   144 Hz monitor), used a gravity of 0.02 px/frame^2, gave the ship no angular
   momentum, and awarded +1 score per frame, which made hovering forever the
   optimal strategy in a game about landing.

   What this engine does instead:

   PHYSICS
     - Fixed 120 Hz integration with an accumulator, decoupled from rendering, so
       the simulation is identical on a 30 Hz laptop and a 240 Hz monitor.
     - Real units. Distances in metres, velocities in m/s, gravity in m/s^2.
       The playfield is 40 m x 30 m at 20 px per metre.
     - Thrust applies along the ship's own axis and is not normalised, so rotating
       while burning curves your trajectory the way it should.
     - Angular momentum: RCS thrusters apply torque, there is damping, and the
       ship keeps spinning until you counter it.
     - Thrust-to-weight improves as fuel burns off, because mass drops.
     - Swept collision against the terrain, so nothing tunnels through the ground
       at high descent rates.

   LANDING
     A touchdown is only good when every one of these holds:
       - both landing legs are in contact (a hull strike is always fatal)
       - the descent rate along the surface normal is under the limit
       - the sideways slide along the surface is under the limit
       - the ship's up-axis is within a few degrees of the surface normal, so a
         slope has to be matched with the same slope
       - the ship is not still rotating when it touches down
     The envelope panel on the canvas shows all of them in real time.

   CHALLENGES
     A run is a ladder of landing sites, not a single drop. Land, then choose to
     bank the score or double down onto a harder site with a smaller pad, more
     wind and less fuel. Crash and you lose everything you had not banked.
   =========================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------- config ---
  var PX_PER_M = 20;
  var STEP = 1 / 120;
  var MAX_STEPS = 8;
  var W = 800, H = 600;
  var WORLD_W = W / PX_PER_M;
  var WORLD_H = H / PX_PER_M;
  var GROUND_MIN_Y = 250;
  var GROUND_MAX_Y = 588;

  var BASE = {
    gravity: 1.78,
    thrustAccel: 4.30,
    burnPerSec: 0.115,
    rcsAccel: 3.6,
    rcsDamp: 1.30,
    maxSpin: 2.70,
    maxTouchdown: 4.6,
    maxLateral: 2.8,
    maxTiltDeg: 15,
    maxSpinAtTouch: 1.30,
    padRadius: 4.6,
    windMax: 0.0,
    fuelStart: 1.0,
    par: 26
  };

  var HULL = {
    halfW: 11,
    noseY: -17,
    shoulderY: -4,
    baseY: 8,
    footX: 14,
    footY: 17,
    bodyR: 2.6
  };

  // ------------------------------------------------------------------ maths ---
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rad2deg(r) { return r * 180 / Math.PI; }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ state ---
  var cfg = Object.create(BASE);
  var ctx = null;
  var run = null;
  var terrain = null;
  var ship = null;
  var particles = [];
  var floaters = [];
  var shake = 0;
  var flash = 0;
  var stars = [];
  var trail = [];
  var t = 0;
  var acc = 0;
  var lastFrame = 0;
  var running = false;
  var paused = false;
  var mode = 'idle';
  var countdown = 0;
  var terrainSrc = [];
  var stockMeta = { ticker: 'AAPL', last: 0, min: 0, max: 0 };
  // `thrust` is the binary keyboard/button command. `throttle`, when set to a
  // number, is a normalised 0..1 engine command and takes precedence; the keys
  // always map to 0 or 1. Real engines are throttleable, and a proportional
  // command is what lets a guidance law hold a hover instead of bang-banging
  // between full thrust and free fall.
  var input = { thrust: false, left: false, right: false, throttle: null };
  var events = [];
  var shootingStar = null;
  var onEvent = null;

  // ------------------------------------------------------------------- ship ---
  function makeShip(x, y) {
    return {
      x: x, y: y,
      prevX: x, prevY: y,
      vx: 0, vy: 0,
      rot: 0,
      spin: 0,
      fuel: cfg.fuelStart,
      dryMass: 1.0,
      fuelMass: 0.72,
      thrusting: false,
      throttle: 0,
      alive: true,
      touchdown: null
    };
  }

  function shipMass() { return ship.dryMass + ship.fuelMass * ship.fuel; }
  function shipUp(s) { return { x: Math.sin(s.rot), y: -Math.cos(s.rot) }; }

  // --------------------------------------------------------------- terrain ---
  function buildTerrain(seed, site) {
    var rng = mulberry32(seed);
    var n = 74;
    var relief = clamp(0.72 + 0.13 * (site - 1), 0.72, 1.35);
    var jag = clamp(0.16 + 0.05 * (site - 1), 0.16, 0.52);
    var pts = [];
    var i, u, base, hill, noise, v;

    for (i = 0; i < n; i++) {
      u = i / (n - 1);
      base = sampleSeries(u);
      hill = Math.sin(u * Math.PI * (2.1 + site * 0.23) + (seed % 628) / 100) * 0.16 * relief;
      noise = (rng() - 0.5) * jag;
      v = clamp(base + hill + noise, 0, 1);
      pts.push({ x: u * W, y: lerp(GROUND_MAX_Y, GROUND_MIN_Y, v), v: v });
    }

    // Flatten short runs to make real pads, then guarantee one wide shelf.
    // Without this some seeds produced a site with nowhere honest to land.
    var s, start, width, target, k;
    for (s = 0; s < 3 + (site % 3); s++) {
      start = 4 + Math.floor(rng() * (n - 10));
      width = 3 + Math.floor(rng() * 3);
      target = pts[start].y;
      for (k = 0; k < width && start + k < n - 2; k++) pts[start + k].y = target;
    }

    var flatStart = 8 + Math.floor(rng() * (n - 30));
    var flatWidth = 9;
    var flatY = clamp(pts[flatStart].y, GROUND_MIN_Y + 20, GROUND_MAX_Y - 10);
    for (k = 0; k < flatWidth; k++) pts[flatStart + k].y = flatY;

    var segs = [];
    for (i = 0; i < pts.length - 1; i++) {
      var p1 = pts[i], p2 = pts[i + 1];
      var dx = p2.x - p1.x, dy = p2.y - p1.y;
      var len = hypot(dx, dy) || 1;
      segs.push({
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        dx: dx, dy: dy, len: len,
        slope: Math.atan2(dy, dx),
        nx: dy / len, ny: -dx / len
      });
    }

    return { pts: pts, segs: segs, flatStart: flatStart, flatWidth: flatWidth, padY: flatY };
  }

  function sampleSeries(u) {
    var s = terrainSrc;
    if (!s || s.length < 2) return 0.5;
    var f = u * (s.length - 1);
    var i = Math.floor(f);
    var frac = f - i;
    var a = s[clamp(i, 0, s.length - 1)];
    var b = s[clamp(i + 1, 0, s.length - 1)];
    var sm = frac * frac * (3 - 2 * frac);
    return lerp(a, b, sm);
  }

  function groundAt(x) {
    if (!terrain) return null;
    var segs = terrain.segs;
    if (x < 0 || x > W) return null;
    var i = clamp(Math.floor(x / W * segs.length), 0, segs.length - 1);
    for (var d = -2; d <= 2; d++) {
      var j = clamp(i + d, 0, segs.length - 1);
      var sg = segs[j];
      if (x >= sg.x1 && x <= sg.x2) {
        var f = (x - sg.x1) / sg.len;
        return { y: sg.y1 + sg.dy * f, seg: sg };
      }
    }
    var fb = segs[clamp(i, 0, segs.length - 1)];
    return { y: fb.y1, seg: fb };
  }

  // ------------------------------------------------------------- particles ---
  function emit(p) {
    if (particles.length > 900) particles.splice(0, 60);
    particles.push(p);
    return p;
  }

  function particlesFrom(count, make) {
    for (var i = 0; i < count; i++) emit(make(i));
  }

  function emitThrust() {
    var up = shipUp(ship);
    var backX = -up.x, backY = -up.y;
    var px = ship.x * PX_PER_M + backX * 16;
    var py = ship.y * PX_PER_M + backY * 16;
    var power = ship.throttle;

    particlesFrom(2, function () {
      var a = ship.rot + Math.PI + (Math.random() - 0.5) * 0.34;
      var sp = (2.2 + Math.random() * 3.4) * (0.55 + power);
      return {
        type: 'thrust',
        x: px + (Math.random() - 0.5) * 7,
        y: py + (Math.random() - 0.5) * 7,
        vx: Math.sin(a) * sp, vy: -Math.cos(a) * sp,
        life: 0.24 + Math.random() * 0.22, maxLife: 0.46,
        size: 1.6 + Math.random() * 2.2 * power,
        color: '255,205,120', grav: 0, drag: 3.4
      };
    });

    // Exhaust smoke is deliberately sparse. At a higher spawn rate it merged into
    // a grey rope that covered the ship and hid the plume.
    if (Math.random() < 0.18) {
      particlesFrom(1, function () {
        var a = ship.rot + Math.PI + (Math.random() - 0.5) * 0.9;
        return {
          type: 'smoke',
          x: px, y: py,
          vx: Math.sin(a) * 1.5, vy: -Math.cos(a) * 1.5,
          life: 0.6 + Math.random() * 0.6, maxLife: 1.2,
          size: 3 + Math.random() * 4, color: '110,104,100',
          grav: -0.4, drag: 1.6, grow: 14
        };
      });
    }
  }

  function emitRcs(dir) {
    var right = { x: Math.cos(ship.rot), y: Math.sin(ship.rot) };
    var sx = ship.x * PX_PER_M - right.x * 15 * dir;
    var sy = ship.y * PX_PER_M - right.y * 15 * dir;
    particlesFrom(2, function () {
      return {
        type: 'thrust',
        x: sx + (Math.random() - 0.5) * 4,
        y: sy + (Math.random() - 0.5) * 4,
        vx: -right.x * (3 + Math.random() * 3) * dir + (Math.random() - 0.5),
        vy: -right.y * (3 + Math.random() * 3) * dir + (Math.random() - 0.5),
        life: 0.16 + Math.random() * 0.14, maxLife: 0.3,
        size: 1.8 + Math.random() * 2, color: '190,230,255',
        grav: 0, drag: 4
      };
    });
  }

  function emitDust(x, y, energy, normal) {
    var n = clamp(Math.round(energy * 26), 6, 46);
    var baseAngle = Math.atan2(normal.y, normal.x);
    particlesFrom(n, function () {
      var a = baseAngle + (Math.random() - 0.5) * 2.6;
      var sp = 1.4 + Math.random() * 6 * clamp(energy, 0.25, 1.6);
      return {
        type: 'dust',
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 5,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.8, maxLife: 1.3,
        size: 2 + Math.random() * 5, color: '150,190,150',
        grav: 1.4, drag: 2.2, grow: 9
      };
    });
  }

  function emitExplosion(x, y, energy) {
    var e = clamp(energy, 0.5, 3);
    shake = Math.min(1, shake + 0.55 + 0.22 * e);
    flash = Math.min(1, flash + 0.5 + 0.2 * e);

    emit({ type: 'shock', x: x, y: y, life: 0.42, maxLife: 0.42, size: 6,
           grow: 260 * e, vx: 0, vy: 0, color: '255,200,120', grav: 0, drag: 0 });

    particlesFrom(Math.round(34 * e), function () {
      var a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 11 * e;
      return {
        type: 'fire', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.28 + Math.random() * 0.5, maxLife: 0.8,
        size: 4 + Math.random() * 9 * e,
        color: Math.random() < 0.5 ? '255,170,60' : '255,90,40',
        grav: -1.6, drag: 2.0, grow: 12
      };
    });

    particlesFrom(Math.round(18 * e), function () {
      var a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 8 * e;
      return {
        type: 'spark', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.9, maxLife: 1.4,
        size: 1 + Math.random() * 1.8, color: '255,240,180',
        grav: 9, drag: 0.6
      };
    });

    particlesFrom(Math.round(10 * e), function () {
      var a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 5;
      return {
        type: 'debris', x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        life: 1.6 + Math.random() * 1.6, maxLife: 3.2,
        size: 2 + Math.random() * 4,
        rot: Math.random() * 6.28, rotVel: (Math.random() - 0.5) * 12,
        color: '170,175,185', grav: 9, drag: 0.25, bounces: true
      };
    });

    particlesFrom(Math.round(14 * e), function () {
      var a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 2.6;
      return {
        type: 'smoke', x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
        life: 1.4 + Math.random() * 1.6, maxLife: 3.0,
        size: 8 + Math.random() * 14, color: '90,88,92',
        grav: -0.7, drag: 1.1, grow: 26
      };
    });
  }

  function addFloater(x, y, text, color, big) {
    floaters.push({ x: x, y: y, text: text, color: color, life: 1.6, maxLife: 1.6, big: !!big });
    if (floaters.length > 24) floaters.shift();
  }

  // ------------------------------------------------------------------ input ---
  function toggleFullscreen() {
    var el = document.getElementById('game-container') || document.documentElement;
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  function keyHandlers() {
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') { input.thrust = true; e.preventDefault(); }
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { input.left = true; e.preventDefault(); }
      if (k === 'ArrowRight' || k === 'd' || k === 'D') { input.right = true; e.preventDefault(); }
      if (k === 'f' || k === 'F') toggleFullscreen();
      if (k === 'p' || k === 'P' || k === 'Escape') {
        if (mode === 'flying' || mode === 'countdown') {
          paused = !paused;
          events.push({ t: 'pause', paused: paused });
        }
      }
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') input.thrust = false;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.left = false;
      if (k === 'ArrowRight' || k === 'd' || k === 'D') input.right = false;
    });
    window.addEventListener('blur', function () {
      input.thrust = input.left = input.right = false;
    });
  }

  // ----------------------------------------------------------------- physics ---
  function step(dt) {
    if (mode === 'countdown') {
      countdown -= dt;
      if (countdown <= 0) { mode = 'flying'; events.push({ t: 'go' }); }
      return;
    }
    if (mode !== 'flying') return;

    t += dt;

    var torque = 0;
    if (input.left) torque -= cfg.rcsAccel;
    if (input.right) torque += cfg.rcsAccel;
    if (torque !== 0 && ship.fuel > 0) {
      ship.spin += torque * dt;
      if (Math.random() < 0.5) emitRcs(torque > 0 ? 1 : -1);
      ship.fuel = Math.max(0, ship.fuel - 0.004 * dt);
    }
    ship.spin -= ship.spin * cfg.rcsDamp * dt;
    ship.spin = clamp(ship.spin, -cfg.maxSpin, cfg.maxSpin);
    ship.rot += ship.spin * dt;

    var throttle;
    if (typeof input.throttle === 'number') {
      throttle = clamp(input.throttle, 0, 1);
    } else {
      throttle = input.thrust ? 1 : 0;
    }
    var wantThrust = throttle > 0.02 && ship.fuel > 0;
    if (ship.fuel <= 0) throttle = 0;
    ship.thrusting = wantThrust;
    ship.throttle = wantThrust ? throttle : 0;

    if (wantThrust) {
      var up = shipUp(ship);
      // A lighter ship accelerates harder for the same throttle. Real rockets do
      // this, and it makes the last seconds of fuel feel different from the first.
      var massRatio = 1.72 / shipMass();
      var a = cfg.thrustAccel * massRatio * ship.throttle;
      ship.vx += up.x * a * dt;
      ship.vy += up.y * a * dt;
      ship.fuel = Math.max(0, ship.fuel - cfg.burnPerSec * massRatio * ship.throttle * dt);
      emitThrust();
    }

    ship.vy += cfg.gravity * dt;
    if (cfg.windMax > 0) ship.vx += windAt(ship.y) * dt;

    var nx = ship.x + ship.vx * dt;
    var ny = ship.y + ship.vy * dt;
    var hit = sweep(ship.x, ship.y, nx, ny);
    if (hit) resolveContact(hit);
    else { ship.x = nx; ship.y = ny; }

    var halfM = HULL.footX / PX_PER_M;
    if (ship.x < halfM) { ship.x = halfM; ship.vx = Math.abs(ship.vx) * 0.35; }
    if (ship.x > WORLD_W - halfM) { ship.x = WORLD_W - halfM; ship.vx = -Math.abs(ship.vx) * 0.35; }
    if (ship.y > WORLD_H + 3) crashAt(ship.x * PX_PER_M, H, 1.4, 'fell out of the sky');

    trail.push({ x: ship.x * PX_PER_M, y: ship.y * PX_PER_M, age: 0 });
    if (trail.length > 260) trail.shift();
  }

  function windAt(yMetres) {
    var phase = t * 0.55 + yMetres * 0.28;
    var gust = Math.sin(phase) * 0.62 + Math.sin(phase * 2.7 + 1.3) * 0.38;
    return cfg.windMax * gust;
  }

  function sweep(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var dist = hypot(dx, dy);
    var sub = Math.max(1, Math.ceil(dist / 0.28));
    for (var s = 1; s <= sub; s++) {
      var f = s / sub;
      var px = (x0 + dx * f) * PX_PER_M;
      var py = (y0 + dy * f) * PX_PER_M;
      var contact = hullContact(px, py);
      if (contact) { contact.f = f; contact.px = px; contact.py = py; return contact; }
    }
    return null;
  }

  function hullContact(px, py) {
    var up = shipUp(ship);
    var rx = Math.cos(ship.rot), ry = Math.sin(ship.rot);

    function toWorld(lx, ly) {
      return { x: px + lx * rx - ly * ry, y: py + lx * ry + ly * rx };
    }

    // A hull strike is always fatal and is tested first, so a nose-first dive
    // can never be mistaken for a leg contact.
    var hullPts = [
      { lx: 0, ly: HULL.noseY + HULL.bodyR },
      { lx: -HULL.halfW, ly: HULL.shoulderY },
      { lx: HULL.halfW, ly: HULL.shoulderY }
    ];
    for (var i = 0; i < hullPts.length; i++) {
      var w = toWorld(hullPts[i].lx, hullPts[i].ly);
      var g = groundAt(w.x);
      if (g && w.y >= g.y) {
        return { kind: 'hull', x: w.x, y: g.y, seg: g.seg, oneLeg: false };
      }
    }

    var wl = toWorld(-HULL.footX, HULL.footY);
    var wr = toWorld(HULL.footX, HULL.footY);
    var gl = groundAt(wl.x);
    var gr = groundAt(wr.x);
    var leftDown = !!(gl && wl.y >= gl.y);
    var rightDown = !!(gr && wr.y >= gr.y);
    if (!leftDown && !rightDown) return null;

    // Contact plane through both feet rather than the segment under one of them.
    // The two feet are 28 px apart and the terrain is sampled every ~10.8 px, so
    // they routinely land on different segments with different normals; using one
    // segment's normal makes the tilt test depend on which foot happened to hit.
    var spanX = wr.x - wl.x;
    var spanY = (gr.y - gl.y);
    var spanLen = hypot(spanX, spanY) || 1;
    var normal = { x: spanY / spanLen, y: -spanX / spanLen };

    return {
      kind: 'legs',
      x: (wl.x + wr.x) / 2,
      y: (gl.y + gr.y) / 2,
      seg: (gl || gr).seg,
      // Kept for diagnostics only. A single leg touching first is normal: the
      // gear compresses and the second foot follows within a few centimetres.
      // Requiring simultaneous contact made almost every real touchdown "fail".
      oneLeg: !(leftDown && rightDown),
      normal: normal,
      groundL: gl.y,
      groundR: gr.y,
      up: up
    };
  }

  function resolveContact(hit) {
    // Use the two-foot contact plane when we have it, so the envelope is measured
    // against the surface the ship is actually resting on.
    var n = hit.normal || { x: hit.seg.nx, y: hit.seg.ny };
    var up = shipUp(ship);
    var vn = ship.vx * n.x + ship.vy * n.y;
    var descent = -vn;
    var tx = -n.y, ty = n.x;
    var slide = ship.vx * tx + ship.vy * ty;
    var dot = clamp(up.x * n.x + up.y * n.y, -1, 1);
    var tiltDeg = rad2deg(Math.acos(dot));
    var spinAbs = Math.abs(ship.spin);
    var reasons = [];

    if (hit.kind === 'hull') reasons.push('hull strike');
    if (descent > cfg.maxTouchdown) reasons.push('too fast (' + descent.toFixed(1) + ' m/s)');
    if (Math.abs(slide) > cfg.maxLateral) reasons.push('sliding (' + Math.abs(slide).toFixed(1) + ' m/s)');
    if (tiltDeg > cfg.maxTiltDeg) reasons.push('tilted ' + tiltDeg.toFixed(0) + ' deg');
    if (spinAbs > cfg.maxSpinAtTouch) reasons.push('still spinning');

    ship.touchdown = { descent: descent, slide: Math.abs(slide), tiltDeg: tiltDeg, spin: spinAbs, reasons: reasons.slice() };

    if (reasons.length === 0) {
      var g = groundAt(hit.x);
      var groundY = g ? g.y : hit.y;
      // Match the slope first, then sit the ship down so the feet rest on the
      // plane. At the midpoint the two lateral foot offsets cancel, leaving only
      // the leg length projected onto the vertical.
      ship.rot = Math.atan2(n.x, -n.y);
      ship.y = (groundY - HULL.footY * Math.cos(ship.rot)) / PX_PER_M;
      ship.x = hit.x / PX_PER_M;
      ship.vx = ship.vy = 0;
      ship.spin = 0;
      ship.alive = true;
      mode = 'landed';
      var energy = clamp(descent / cfg.maxTouchdown, 0.15, 1);
      emitDust(hit.x, groundY, energy, n);
      shake = Math.min(1, shake + 0.10 + 0.16 * energy);
      events.push({ t: 'landed', touchdown: ship.touchdown, x: hit.x, groundY: groundY, descent: descent });
    } else {
      var speed = hypot(ship.vx, ship.vy);
      crashAt(hit.x, hit.y, clamp(speed / 6, 0.7, 3), reasons[0]);
    }
  }

  function crashAt(x, y, energy, reason) {
    if (mode === 'crashed') return;
    ship.alive = false;
    ship.vx = ship.vy = 0;
    mode = 'crashed';
    emitExplosion(x, y, energy);
    events.push({ t: 'crashed', reason: reason, x: x, y: y, energy: energy });
  }

  // -------------------------------------------------------------------- run ---
  function newRun(opts) {
    opts = opts || {};
    run = {
      site: 1,
      multiplier: 1,
      banked: 0,
      pending: 0,
      history: [],
      seedBase: opts.seed || (Date.now() & 0x7fffffff),
      difficulty: opts.difficulty || 'medium',
      playerName: opts.name || ''
    };
    applySite();
  }

  function applySite() {
    var d = run.difficulty;
    var diffScale = d === 'easy' ? 0.86 : (d === 'hard' ? 1.22 : 1.0);
    var site = run.site;

    cfg.gravity        = BASE.gravity * (0.94 + 0.03 * (site - 1));
    cfg.thrustAccel    = BASE.thrustAccel * (d === 'hard' ? 1.0 : 1.04);
    cfg.burnPerSec     = BASE.burnPerSec * (0.95 + 0.05 * (site - 1)) * diffScale;
    cfg.rcsAccel       = BASE.rcsAccel * (d === 'easy' ? 1.12 : (d === 'hard' ? 0.92 : 1));
    cfg.rcsDamp        = BASE.rcsDamp;
    cfg.maxSpin        = BASE.maxSpin;
    cfg.maxTouchdown   = BASE.maxTouchdown * (d === 'easy' ? 1.25 : (d === 'hard' ? 0.72 : 1)) / (1 + 0.05 * (site - 1));
    cfg.maxLateral     = BASE.maxLateral * (d === 'easy' ? 1.3 : (d === 'hard' ? 0.75 : 1)) / (1 + 0.05 * (site - 1));
    cfg.maxTiltDeg     = BASE.maxTiltDeg * (d === 'easy' ? 1.25 : (d === 'hard' ? 0.75 : 1));
    cfg.maxSpinAtTouch = BASE.maxSpinAtTouch * (d === 'easy' ? 1.25 : 1);
    cfg.padRadius      = Math.max(1.9, BASE.padRadius * (d === 'easy' ? 1.2 : (d === 'hard' ? 0.62 : 1)) / (1 + 0.10 * (site - 1)));
    cfg.windMax        = (d === 'easy' ? 0 : (d === 'hard' ? 0.72 : 0.42)) * clamp(0.35 + 0.25 * (site - 1), 0, 1.5);
    cfg.fuelStart      = d === 'easy' ? 1.0 : (d === 'hard' ? 0.82 : 0.92);
    cfg.par            = BASE.par + 1.5 * (site - 1);

    terrain = buildTerrain(run.seedBase + site * 7919, site);

    var rng = mulberry32(run.seedBase + site * 104729);
    var padIdx = terrain.flatStart + Math.floor(terrain.flatWidth / 2);
    var beaconX = terrain.pts[clamp(padIdx, 0, terrain.pts.length - 1)].x;
    if (site > 2) beaconX += (rng() - 0.5) * 40;
    beaconX = clamp(beaconX, 30, W - 30);
    terrain.beaconX = beaconX;
    terrain.beaconY = groundAt(beaconX).y;

    // Spawn high and off to one side so there is a real traverse to fly,
    // alternating sides so you cannot memorise one entry line.
    var side = (site % 2 === 0) ? 1 : -1;
    var spawnX = clamp(beaconX + side * (90 + 34 * (site % 4)), 40, W - 40);
    var spawnY = 52 + (site % 3) * 10;
    ship = makeShip(spawnX / PX_PER_M, spawnY / PX_PER_M);
    ship.fuel = cfg.fuelStart;

    particles = [];
    floaters = [];
    trail = [];
    mode = 'countdown';
    countdown = 2.2;
    t = 0;
    acc = 0;
    paused = false;
    events.push({ t: 'site', site: site, cfg: cfg, beacon: { x: terrain.beaconX, y: terrain.beaconY } });
  }

  function scoreLanding() {
    var td = ship.touchdown || { descent: cfg.maxTouchdown, slide: 0, tiltDeg: 0 };
    var dist = Math.abs(ship.x * PX_PER_M - terrain.beaconX) / PX_PER_M;

    var precision = clamp(1 - dist / (cfg.padRadius * 2.1), 0, 1);
    var bullseye = dist < cfg.padRadius * 0.22;
    var softness = clamp(1 - td.descent / cfg.maxTouchdown, 0, 1);
    var fuelPart = clamp(ship.fuel, 0, 1);
    var timePart = clamp(1 - t / cfg.par, 0, 1);
    var align = clamp(1 - td.tiltDeg / Math.max(1, cfg.maxTiltDeg), 0, 1);

    var parts = {
      base: 800,
      precision: Math.round(precision * 1400),
      softness: Math.round(softness * 700),
      fuel: Math.round(fuelPart * 620),
      time: Math.round(timePart * 520),
      align: Math.round(align * 360),
      bullseye: bullseye ? 500 : 0
    };
    var subtotal = parts.base + parts.precision + parts.softness + parts.fuel +
                   parts.time + parts.align + parts.bullseye;
    var siteScale = 1 + 0.17 * (run.site - 1);
    var gained = Math.round(subtotal * siteScale * run.multiplier);

    run.pending += gained;
    run.history.push({ site: run.site, dist: dist, descent: td.descent, gained: gained });

    addFloater(ship.x * PX_PER_M, ship.y * PX_PER_M - 34, '+' + gained.toLocaleString(),
               bullseye ? '#ffd166' : '#00ff9d', true);
    if (bullseye) addFloater(terrain.beaconX, terrain.beaconY - 56, 'BULLSEYE', '#ffd166');

    return { parts: parts, gained: gained, dist: dist, bullseye: bullseye, touchdown: td };
  }

  // ----------------------------------------------------------------- render ---
  function makeStars() {
    stars = [];
    var rng = mulberry32(99);
    var counts = [70, 46, 26];
    var radii = [0.7, 1.1, 1.7];
    for (var layer = 0; layer < 3; layer++) {
      for (var i = 0; i < counts[layer]; i++) {
        stars.push({
          x: rng() * W, y: rng() * H * 0.62,
          r: radii[layer] * (0.7 + rng() * 0.7),
          a: 0.3 + rng() * 0.7, p: rng() * 6.28, layer: layer
        });
      }
    }
  }

  function drawStars(dt) {
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#04060d');
    bg.addColorStop(0.45, '#070a16');
    bg.addColorStop(1, '#0b0718');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    var n1 = ctx.createRadialGradient(W * 0.22, H * 0.22, 0, W * 0.22, H * 0.22, W * 0.45);
    n1.addColorStop(0, 'rgba(90,40,180,0.15)');
    n1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = n1;
    ctx.fillRect(0, 0, W, H);

    var n2 = ctx.createRadialGradient(W * 0.82, H * 0.5, 0, W * 0.82, H * 0.5, W * 0.4);
    n2.addColorStop(0, 'rgba(0,150,180,0.11)');
    n2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = n2;
    ctx.fillRect(0, 0, W, H);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.68 + Math.sin(t * (1.1 + s.layer * 0.7) + s.p) * 0.32;
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = (i % 17 === 0) ? '#ffd8a8' : (i % 11 === 0 ? '#a8d8ff' : '#ffffff');
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!shootingStar && Math.random() < 0.0022) {
      shootingStar = { x: Math.random() * W * 0.8, y: Math.random() * H * 0.3, life: 0.9, maxLife: 0.9 };
    }
    if (shootingStar) {
      shootingStar.life -= dt;
      var f = 1 - shootingStar.life / shootingStar.maxLife;
      var sx = shootingStar.x + f * 190, sy = shootingStar.y + f * 90;
      var grad = ctx.createLinearGradient(sx - 90, sy - 42, sx, sy);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(255,255,255,' + (0.85 * (1 - f)) + ')');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 90, sy - 42);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      if (shootingStar.life <= 0) shootingStar = null;
    }
  }

  function drawTerrain() {
    var pts = terrain.pts;
    var i;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();

    var fill = ctx.createLinearGradient(0, GROUND_MIN_Y, 0, H);
    fill.addColorStop(0, 'rgba(0,255,157,0.20)');
    fill.addColorStop(0.55, 'rgba(0,140,95,0.10)');
    fill.addColorStop(1, 'rgba(0,40,30,0.02)');
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,255,157,0.09)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy < H; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
    ctx.restore();

    ctx.shadowColor = 'rgba(0,255,157,0.9)';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#00ff9d';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(220,255,240,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawBeacon() {
    var bx = terrain.beaconX, by = terrain.beaconY;
    var pulse = 0.6 + Math.sin(t * 3.4) * 0.4;
    var padW = cfg.padRadius * PX_PER_M;

    ctx.save();
    var g = ctx.createLinearGradient(bx - padW, by, bx + padW, by);
    g.addColorStop(0, 'rgba(255,209,102,0.05)');
    g.addColorStop(0.5, 'rgba(255,209,102,' + (0.22 + pulse * 0.16) + ')');
    g.addColorStop(1, 'rgba(255,209,102,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(bx - padW, by - 3, padW * 2, 10);

    ctx.strokeStyle = 'rgba(255,209,102,' + (0.55 + pulse * 0.4) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - padW, by);
    ctx.lineTo(bx + padW, by);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,209,102,0.85)';
    ctx.fillRect(bx - 1, by - 22, 2, 22);
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 16 * pulse + 6;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(bx, by - 24, 3.6, 0, 6.2832);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255,209,102,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(bx, by - 24);
    ctx.lineTo(bx, by - 84);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawTrail() {
    if (trail.length < 2) return;
    ctx.save();
    ctx.lineWidth = 2;
    for (var i = 1; i < trail.length; i++) {
      var a = trail[i - 1], b = trail[i];
      var age = i / trail.length;
      ctx.strokeStyle = 'rgba(0,229,255,' + (age * 0.42) + ')';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.type !== 'thrust' && p.type !== 'fire' && p.type !== 'spark' && p.type !== 'shock') continue;
      var a = clamp(p.life / p.maxLife, 0, 1);
      if (p.type === 'shock') {
        ctx.strokeStyle = 'rgba(' + p.color + ',' + (a * 0.7) + ')';
        ctx.lineWidth = 3 * a + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, 6.2832);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = 'rgba(' + p.color + ',' + a + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.4, p.size), 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();

    for (var j = 0; j < particles.length; j++) {
      var q = particles[j];
      if (q.type === 'thrust' || q.type === 'fire' || q.type === 'spark' || q.type === 'shock') continue;
      var a2 = clamp(q.life / q.maxLife, 0, 1);
      ctx.globalAlpha = a2 * (q.type === 'dust' ? 0.65 : 0.8);
      ctx.fillStyle = 'rgba(' + q.color + ',1)';
      if (q.type === 'debris') {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot || 0);
        ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(q.x, q.y, Math.max(0.5, q.size), 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawShip(alpha) {
    if (!ship.alive) return;
    var px = lerp(ship.prevX, ship.x, alpha) * PX_PER_M;
    var py = lerp(ship.prevY, ship.y, alpha) * PX_PER_M;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ship.rot);

    if (ship.thrusting) {
      var flick = 0.75 + Math.random() * 0.25;
      var plume = (22 + Math.random() * 13) * flick * (0.55 + 0.45 * ship.throttle);

      // Outer cone, then a tighter, brighter core. Two shapes read as a flame;
      // one wide triangle read as a grey blob once the smoke was added on top.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var outer = ctx.createLinearGradient(0, HULL.baseY, 0, HULL.baseY + plume);
      outer.addColorStop(0, 'rgba(255,190,90,0.85)');
      outer.addColorStop(0.45, 'rgba(255,120,40,0.45)');
      outer.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.moveTo(-6.0, HULL.baseY);
      ctx.lineTo(6.0, HULL.baseY);
      ctx.lineTo(0, HULL.baseY + plume);
      ctx.closePath();
      ctx.fill();

      var core = ctx.createLinearGradient(0, HULL.baseY, 0, HULL.baseY + plume * 0.62);
      core.addColorStop(0, 'rgba(255,255,235,0.98)');
      core.addColorStop(0.5, 'rgba(255,225,150,0.8)');
      core.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.moveTo(-3.0, HULL.baseY);
      ctx.lineTo(3.0, HULL.baseY);
      ctx.lineTo(0, HULL.baseY + plume * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = '#9fb2c4';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-HULL.halfW + 1, HULL.shoulderY + 4);
    ctx.lineTo(-HULL.footX, HULL.footY);
    ctx.moveTo(HULL.halfW - 1, HULL.shoulderY + 4);
    ctx.lineTo(HULL.footX, HULL.footY);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-HULL.footX - 3.4, HULL.footY);
    ctx.lineTo(-HULL.footX + 3.4, HULL.footY);
    ctx.moveTo(HULL.footX - 3.4, HULL.footY);
    ctx.lineTo(HULL.footX + 3.4, HULL.footY);
    ctx.stroke();

    var hullGrad = ctx.createLinearGradient(-HULL.halfW, 0, HULL.halfW, 0);
    hullGrad.addColorStop(0, '#8f9bab');
    hullGrad.addColorStop(0.42, '#e8f2fb');
    hullGrad.addColorStop(1, '#7f8b9b');
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.moveTo(0, HULL.noseY);
    ctx.lineTo(HULL.halfW, HULL.shoulderY);
    ctx.lineTo(HULL.halfW - 2, HULL.baseY);
    ctx.lineTo(-HULL.halfW + 2, HULL.baseY);
    ctx.lineTo(-HULL.halfW, HULL.shoulderY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,30,40,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();

    var wg = ctx.createRadialGradient(-1, -8, 0.5, 0, -6, 6);
    wg.addColorStop(0, '#dff6ff');
    wg.addColorStop(1, '#2f8fd8');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.arc(0, -6, 4.6, 0, 6.2832);
    ctx.fill();

    ctx.fillStyle = '#c8d4e0';
    ctx.fillRect(-HULL.halfW - 2.6, HULL.shoulderY + 1, 3, 3);
    ctx.fillRect(HULL.halfW - 0.4, HULL.shoulderY + 1, 3, 3);
    ctx.restore();

    var frac = clamp(ship.fuel, 0, 1);
    ctx.save();
    ctx.translate(px, py);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.arc(0, 0, 25, -Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = frac > 0.5 ? '#00ff9d' : (frac > 0.22 ? '#ffd166' : '#ff2d55');
    ctx.beginPath();
    ctx.arc(0, 0, 25, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * frac);
    ctx.stroke();
    ctx.restore();
  }

  function drawVelocityVector() {
    if (mode !== 'flying' || !ship.alive) return;
    var speed = hypot(ship.vx, ship.vy);
    if (speed < 0.35) return;
    var px = ship.x * PX_PER_M, py = ship.y * PX_PER_M;
    var len = clamp(speed * 5, 14, 54);
    var ux = ship.vx / speed, uy = ship.vy / speed;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,229,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + ux * len, py + uy * len);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + ux * len, py + uy * len, 3, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
  }

  function drawFloaters(dt) {
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.life -= dt;
      f.y -= 26 * dt;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.font = (f.big ? 'bold 20px ' : '14px ') + '"Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  function drawWind() {
    if (cfg.windMax <= 0 || mode !== 'flying') return;
    var w = windAt(ship.y);
    var strength = Math.min(1, Math.abs(w) / cfg.windMax);
    var dir = w > 0 ? 1 : -1;
    var len = 24 + strength * 44;

    ctx.save();
    ctx.globalAlpha = 0.6 + strength * 0.35;
    ctx.strokeStyle = w > 0 ? '#ff8a3d' : '#5db8ff';
    ctx.fillStyle = w > 0 ? '#ff8a3d' : '#5db8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W - 150, 28);
    ctx.lineTo(W - 150 + dir * len, 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W - 150 + dir * len, 28);
    ctx.lineTo(W - 150 + dir * (len - 7), 23);
    ctx.lineTo(W - 150 + dir * (len - 7), 33);
    ctx.closePath();
    ctx.fill();
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('WIND ' + Math.abs(w).toFixed(2), W - 300, 32);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.16 + strength * 0.2;
    ctx.strokeStyle = '#9fd8ff';
    ctx.lineWidth = 1;
    var rng = mulberry32(Math.floor(t * 6));
    for (var i = 0; i < 16; i++) {
      var sx = rng() * W, sy = rng() * H * 0.7;
      var ln = 16 + rng() * 34;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dir * ln, sy + 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnvelope() {
    if (mode !== 'flying' || !ship.alive) return;
    var g = groundAt(ship.x * PX_PER_M);
    if (!g) return;
    var n = g.seg;
    var up = shipUp(ship);
    var vn = ship.vx * n.nx + ship.vy * n.ny;
    var descent = -vn;
    var tx = -n.ny, ty = n.nx;
    var slide = Math.abs(ship.vx * tx + ship.vy * ty);
    var tilt = rad2deg(Math.acos(clamp(up.x * n.nx + up.y * n.ny, -1, 1)));
    var spin = Math.abs(ship.spin);
    var alt = (g.y / PX_PER_M) - ship.y;
    if (alt > 9) return;

    var checks = [
      { ok: descent <= cfg.maxTouchdown, label: 'DOWN', value: descent.toFixed(1) + '/' + cfg.maxTouchdown.toFixed(1) },
      { ok: slide <= cfg.maxLateral, label: 'SIDE', value: slide.toFixed(1) + '/' + cfg.maxLateral.toFixed(1) },
      { ok: tilt <= cfg.maxTiltDeg, label: 'TILT', value: tilt.toFixed(0) + '/' + cfg.maxTiltDeg.toFixed(0) },
      { ok: spin <= cfg.maxSpinAtTouch, label: 'SPIN', value: spin.toFixed(1) + '/' + cfg.maxSpinAtTouch.toFixed(1) }
    ];

    var bx = 12, by = H - 12 - checks.length * 15;
    ctx.save();
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(4,8,14,0.72)';
    ctx.fillRect(bx - 6, by - 14, 216, checks.length * 15 + 10);
    ctx.strokeStyle = 'rgba(0,255,157,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 6, by - 14, 216, checks.length * 15 + 10);
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i];
      ctx.fillStyle = c.ok ? '#00ff9d' : '#ff2d55';
      ctx.fillText((c.ok ? 'OK  ' : 'FAIL') + ' ' + c.label, bx, by + i * 15 + 6);
      ctx.fillStyle = 'rgba(214,255,239,0.75)';
      ctx.fillText(c.value, bx + 120, by + i * 15 + 6);
    }
    ctx.restore();
  }

  function drawHudCanvas() {
    var g = groundAt(ship.x * PX_PER_M);
    var alt = g ? Math.max(0, (g.y / PX_PER_M) - ship.y) : 0;
    ctx.save();
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(214,255,239,0.85)';
    ctx.fillText('ALT ' + alt.toFixed(1) + 'm', 12, 24);
    ctx.fillStyle = 'rgba(255,209,102,0.9)';
    ctx.fillText('SITE ' + run.site + '  x' + run.multiplier, 12, 42);
    if (run.pending > 0) {
      ctx.fillStyle = '#00ff9d';
      ctx.fillText('$' + run.pending.toLocaleString(), 12, 60);
    }
    ctx.restore();
  }

  function render(alpha, dt) {
    var sx = 0, sy = 0;
    if (shake > 0.001) {
      var mag = shake * shake * 15;
      sx = (Math.random() - 0.5) * mag;
      sy = (Math.random() - 0.5) * mag;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(sx, sy);

    drawStars(dt);
    drawTrail();
    drawTerrain();
    drawBeacon();
    drawParticles();
    drawVelocityVector();
    if (ship) drawShip(alpha);
    drawWind();
    drawEnvelope();
    if (run && ship) drawHudCanvas();
    drawFloaters(dt);
    ctx.restore();

    if (flash > 0.001) {
      ctx.fillStyle = 'rgba(255,220,160,' + (flash * 0.35) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    if (mode === 'countdown') {
      ctx.save();
      ctx.fillStyle = 'rgba(2,4,8,0.6)';
      ctx.fillRect(0, H * 0.3, W, 96);
      ctx.textAlign = 'center';
      ctx.font = 'bold 34px "Press Start 2P", monospace';
      ctx.fillStyle = '#00ff9d';
      ctx.shadowColor = '#00ff9d';
      ctx.shadowBlur = 18;
      var n = Math.ceil(countdown - 0.2);
      ctx.fillText(n > 0 ? String(n) : 'GO', W / 2, H * 0.3 + 58);
      ctx.shadowBlur = 0;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = 'rgba(214,255,239,0.85)';
      ctx.fillText('SITE ' + run.site + ' - LAND ON THE BEACON', W / 2, H * 0.3 + 84);
      ctx.restore();
      ctx.textAlign = 'left';
    }

    if (paused) {
      ctx.fillStyle = 'rgba(2,4,8,0.66)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffd166';
      ctx.fillText('PAUSED', W / 2, H / 2);
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = 'rgba(214,255,239,0.8)';
      ctx.fillText('P TO RESUME', W / 2, H / 2 + 28);
      ctx.textAlign = 'left';
    }
  }

  function stepParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += (p.grav || 0) * PX_PER_M * dt;
      if (p.drag) {
        var k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy *= k;
      }
      p.x += p.vx * PX_PER_M * dt;
      p.y += p.vy * PX_PER_M * dt;
      if (p.grow) p.size += p.grow * dt;
      if (p.rotVel) p.rot = (p.rot || 0) + p.rotVel * dt;
      if (p.bounces) {
        var g = groundAt(p.x);
        if (g && p.y > g.y) {
          p.y = g.y;
          p.vy = -Math.abs(p.vy) * 0.34;
          p.vx *= 0.7;
          p.rotVel = (p.rotVel || 0) * 0.5;
          if (Math.abs(p.vy) < 0.4) { p.vy = 0; p.grav = 0; p.bounces = false; }
        }
      }
    }
  }

  // ------------------------------------------------------------------- loop ---
  function drainEvents() {
    if (!events.length) return;
    var list = events.slice();
    events.length = 0;
    var scored = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].t === 'landed') {
        // Score it here and deliver "scored" in the same pass. Queueing it for
        // the next drain meant the cash-out panel could arrive a physics step
        // after the landing, and never at all if the loop stopped in between.
        scored = scoreLanding();
      }
      if (onEvent) onEvent(list[i]);
    }
    if (scored && onEvent) {
      onEvent({
        t: 'scored', parts: scored.parts, gained: scored.gained,
        dist: scored.dist, bullseye: scored.bullseye, touchdown: scored.touchdown
      });
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    var delta = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;

    if (!paused && mode !== 'idle' && ship) {
      acc += delta;
      var steps = 0;
      while (acc >= STEP && steps < MAX_STEPS) {
        ship.prevX = ship.x;
        ship.prevY = ship.y;
        step(STEP);
        stepParticles(STEP);
        acc -= STEP;
        steps++;
      }
      if (acc > STEP * MAX_STEPS) acc = 0;
    }

    if (shake > 0) shake = Math.max(0, shake - delta * 1.9);
    if (flash > 0) flash = Math.max(0, flash - delta * 2.6);

    if (terrain && ship) render(clamp(acc / STEP, 0, 1), delta);
    else if (ctx) { ctx.fillStyle = '#04060d'; ctx.fillRect(0, 0, W, H); }

    drainEvents();
  }

  // ------------------------------------------------------------- public API ---
  function setTerrainFromStock(data, ticker) {
    if (ticker) stockMeta.ticker = ticker;
    if (data && Array.isArray(data.points) && data.points.length > 1) {
      var ys = data.points.map(function (p) { return p.y; });
      var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
      var span = (hi - lo) || 1;
      // Normalise so 1 = expensive (high on the chart) and 0 = cheap.
      terrainSrc = ys.map(function (y) { return 1 - (y - lo) / span; });
      stockMeta.min = data.minP || 0;
      stockMeta.max = data.maxP || 0;
      stockMeta.last = data.points[data.points.length - 1].price || 0;
    } else {
      terrainSrc = [];
    }
  }

  function snapshot() {
    if (!ship || !run) return { mode: 'idle' };
    var g = groundAt(ship.x * PX_PER_M);
    return {
      mode: mode,
      paused: paused,
      t: +t.toFixed(2),
      coordSystem: 'origin top-left, +x right, +y down, units are metres; canvas is 40x30 m at 20 px/m',
      ship: {
        x: +ship.x.toFixed(2), y: +ship.y.toFixed(2),
        vx: +ship.vx.toFixed(2), vy: +ship.vy.toFixed(2),
        rotDeg: +rad2deg(ship.rot).toFixed(1), spin: +ship.spin.toFixed(2),
        fuel: +ship.fuel.toFixed(3),
        // Current full-throttle acceleration. It rises as fuel burns off, so a
        // controller that assumes a constant value will over-thrust late in a run.
        maxAccel: +(cfg.thrustAccel * (1.72 / shipMass())).toFixed(3),
        massRatio: +(1.72 / shipMass()).toFixed(3),
        altM: g ? +((g.y / PX_PER_M) - ship.y).toFixed(2) : null
      },
      limits: {
        maxTouchdown: +cfg.maxTouchdown.toFixed(2),
        maxLateral: +cfg.maxLateral.toFixed(2),
        maxTiltDeg: +cfg.maxTiltDeg.toFixed(1),
        padRadiusM: +cfg.padRadius.toFixed(2),
        windMax: +cfg.windMax.toFixed(2)
      },
      run: { site: run.site, multiplier: run.multiplier, banked: run.banked, pending: run.pending },
      beacon: terrain ? { x: +terrain.beaconX.toFixed(1), y: +terrain.beaconY.toFixed(1) } : null
    };
  }

  var api = {
    start: function (opts) {
      opts = opts || {};
      if (opts.terrainSource) setTerrainFromStock(opts.terrainSource, opts.ticker);
      newRun(opts);
      return snapshot();
    },
    snapshot: snapshot,
    setTerrainFromStock: setTerrainFromStock,
    onEvent: function (fn) { onEvent = fn; },
    addFloater: addFloater,
    bank: function () {
      if (!run) return 0;
      run.banked += run.pending;
      var b = run.pending;
      run.pending = 0;
      return b;
    },
    pending: function () { return run ? run.pending : 0; },
    banked: function () { return run ? run.banked : 0; },
    site: function () { return run ? run.site : 0; },
    multiplier: function () { return run ? run.multiplier : 1; },
    nextSite: function () {
      if (!run) return;
      run.site += 1;
      run.multiplier = 1 + 0.5 * (run.site - 1);
      applySite();
    },
    setDifficulty: function (d) { if (run) { run.difficulty = d; applySite(); } },
    input: input,
    mode: function () { return mode; },
    config: function () { return cfg; },
    constants: { PX_PER_M: PX_PER_M, W: W, H: H }
  };

  // Deterministic hooks required by the develop-web-game test loop.
  window.render_game_to_text = function () { return JSON.stringify(snapshot()); };
  // Carry the remainder between calls. Without this, advanceTime(40) x25 and
  // advanceTime(1000) x1 would integrate a different number of fixed steps
  // (40 ms rounds to 5 steps, so 25 calls = 125 steps instead of 120) and the
  // hook would silently misreport the physics as frame-rate dependent.
  var testResidual = 0;
  window.advanceTime = function (ms) {
    if (!ship) return snapshot();
    testResidual += ms / 1000;
    var steps = Math.floor(testResidual / STEP);
    testResidual -= steps * STEP;
    for (var i = 0; i < steps; i++) {
      if (mode === 'idle' || mode === 'crashed') break;
      ship.prevX = ship.x;
      ship.prevY = ship.y;
      step(STEP);
      stepParticles(STEP);
      drainEvents();
    }
    render(1, ms / 1000);
    return snapshot();
  };

  window.DegenLanderEngine = api;
  window.DegenLanderBoot = function (canvas) {
    ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    makeStars();
    keyHandlers();
    if (!running) { running = true; lastFrame = 0; requestAnimationFrame(frame); }
    return api;
  };
})();
