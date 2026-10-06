/* ===========================================================================
   DEGENERATE SLOTS: engine

   The old machine was pure RNG. `spinReels()` picked a random symbol index per
   reel, `checkWin()` compared them, and the player had no decisions to make and
   no influence over the outcome. There was no goal, no target and no way to win:
   the only terminal state was running out of money.

   This is a skill-stop machine instead, the way physical arcade slots worked.
   The reels scroll continuously and YOU stop each one. Reel 1 sets the symbol
   you are chasing, so reels 2 and 3 become an explicit aiming task with the
   target lit up on the strip. The scroll is driven by a fixed timestep, so the
   timing window is the same on a 60 Hz laptop and a 144 Hz monitor.

   GOAL   Turn $1,000 into $3,000 before your 30 spins run out.
   SKILL  Reel timing. Reel 1 decides what you are chasing; reels 2 and 3 decide
          whether you can hit it twice in a row.
   WIN    Finish a spin at or above the target.
   LOSE   Balance falls below the minimum bet, or the spins run out short.
   =========================================================================== */
(function () {
  'use strict';

  var W = 720, H = 474;
  var CABINET_TOP = 46;          // leaves a strip above the reels for messages
  var STEP = 1 / 120;

  // ---------------------------------------------------------------- tuning
  var START_BALANCE = 1000;
  var TARGET = 2000;
  var MAX_SPINS = 22;
  var MIN_BET = 10;
  var MAX_BET = 100;
  var BET_STEP = 10;

  var CELL = 116;                 // px per symbol cell on the strip
  var WINDOW_H = CELL * 3;        // three cells visible
  var SCROLL = 1.55;              // cells per second
  var PERFECT = 0.16;             // fraction of a cell counted as a perfect stop

  // Payouts are tuned around the fact that a skilled player can beat the 1-in-25
  // random chance of three of a kind. Random play returns about 1.02x per spin,
  // which is break-even and gets nowhere near the target in 25 spins. Landing a
  // chosen symbol even 10% of the time turns the top symbol into 2x per spin and
  // the target becomes reachable. The earlier 60x top payout made a single lucky
  // spin win the game outright, which removed the skill.
  var SYMBOLS = [
    { key: 'rocket',  glyph: '\uD83D\uDE80', pay: 12,  color: '#ff2d55' },
    { key: 'diamond', glyph: '\uD83D\uDC8E', pay: 7,   color: '#00e5ff' },
    { key: 'fire',    glyph: '\uD83D\uDD25', pay: 4,   color: '#ff8a3d' },
    { key: 'money',   glyph: '\uD83D\uDCB0', pay: 3,   color: '#ffd166' },
    { key: 'ape',     glyph: '\uD83E\uDD8D', pay: 2,   color: '#00ff9d' }
  ];
  var TWO_PAY = 0.35;             // two of a kind returns a third of the bet

  // ------------------------------------------------------------------ state
  var ctx = null;
  var mode = 'menu';              // menu | ready | spinning | resolving | over
  var balance = START_BALANCE;
  var bet = MIN_BET;
  var spinsLeft = MAX_SPINS;
  var peak = START_BALANCE;
  var reels = [];
  var locked = [false, false, false];
  var lastResults = null;
  var lastWin = 0;
  var lastBet = 0;
  var message = '';
  var messageTimer = 0;
  var shake = 0;
  var flash = 0;
  var particles = [];
  var floaters = [];
  var t = 0;
  var acc = 0;
  var lastFrame = 0;
  var paused = false;
  var onEvent = null;
  var events = [];
  var history = [];
  var rngState = 20261006;

  function rng() {
    rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
    var x = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ------------------------------------------------------------------ reels
  function makeReel(offset) {
    return { pos: offset, stopped: false, index: -1, offsetWithin: 0, perfect: false };
  }

  function resetReels() {
    // Stagger the starting positions so the three strips never line up by luck.
    reels = [makeReel(0), makeReel(1.7), makeReel(3.3)];
    locked = [false, false, false];
  }

  /** Which symbol sits under the payline for a given strip position. */
  function symbolAt(pos) {
    var i = Math.floor(pos) % SYMBOLS.length;
    if (i < 0) i += SYMBOLS.length;
    return i;
  }

  /** Distance from the payline centre, in cells, in the range -0.5 to 0.5. */
  function offsetAt(pos) {
    var f = pos - Math.floor(pos);
    return f < 0.5 ? f : f - 1;
  }

  function stopReel(i) {
    if (mode !== 'spinning' || locked[i]) return null;
    var r = reels[i];
    r.stopped = true;
    r.index = symbolAt(r.pos);
    r.offsetWithin = offsetAt(r.pos);
    r.perfect = Math.abs(r.offsetWithin) <= PERFECT;
    locked[i] = true;
    shake = Math.min(1, shake + 0.18);
    spark(r, SYMBOLS[r.index].color);
    if (window.DegenSound) DegenSound.play('game', 'reelStop');
    events.push({ t: 'reel', index: i, symbol: SYMBOLS[r.index].key, perfect: r.perfect, offset: r.offsetWithin });

    if (locked[0] && locked[1] && locked[2]) resolveSpin();
    return SYMBOLS[r.index];
  }

  function resolveSpin() {
    mode = 'resolving';
    var idx = [reels[0].index, reels[1].index, reels[2].index];
    var counts = {};
    for (var i = 0; i < 3; i++) counts[idx[i]] = (counts[idx[i]] || 0) + 1;

    var win = 0;
    var kind = 'none';
    var matched = null;
    for (var k in counts) {
      if (counts[k] === 3) { kind = 'three'; matched = Number(k); break; }
    }
    if (kind === 'none') {
      for (var k2 in counts) {
        if (counts[k2] === 2) { kind = 'two'; matched = Number(k2); break; }
      }
    }

    var perfectAll = reels[0].perfect && reels[1].perfect && reels[2].perfect;
    var perfectBonus = 0;

    if (kind === 'three') {
      // Payout scales with the stake that was actually taken for this spin.
      win = lastBet * SYMBOLS[matched].pay;
      if (perfectAll) {
        perfectBonus = Math.round(win * 0.5);
        win += perfectBonus;
      }
      shake = 1; flash = 0.7;
      burst(W / 2, WINDOW_H / 2, 44, SYMBOLS[matched].color.replace('#', '').match(/../g).map(function (h) { return parseInt(h, 16); }).join(','));
      if (window.DegenSound) DegenSound.play('game', SYMBOLS[matched].pay >= 25 ? 'jackpot' : 'win');
    } else if (kind === 'two') {
      win = Math.round(lastBet * TWO_PAY);
      if (window.DegenSound) DegenSound.play('game', 'coin');
    } else {
      if (window.DegenSound) DegenSound.play('game', 'lose');
    }

    balance += win;
    if (balance > peak) peak = balance;
    lastWin = win;
    lastResults = { idx: idx, kind: kind, matched: matched, win: win, perfect: perfectAll, perfectBonus: perfectBonus };
    spinsLeft -= 1;
    history.push({ spin: MAX_SPINS - spinsLeft, win: win, kind: kind, balance: balance });

    if (win > 0) {
      say(win >= bet * 25 ? 'JACKPOT  +$' + win : 'PAYS  +$' + win, win >= bet * 25 ? '#ffd166' : '#00ff9d');
      addFloater(W / 2, WINDOW_H / 2 - 40, '+$' + win, win >= bet * 25 ? '#ffd166' : '#00ff9d');
    } else {
      say('NOTHING. AGAIN.', '#ff2d55');
    }

    events.push({
      t: 'spin', kind: kind, win: win, balance: balance,
      reels: idx.slice(), perfect: perfectAll, spinsLeft: spinsLeft
    });

    checkEnd();
  }

  function checkEnd() {
    if (mode === 'over') return;
    if (balance >= TARGET) {
      endRun(true, 'target');
      return;
    }
    if (balance < MIN_BET) { endRun(false, 'broke'); return; }
    if (spinsLeft <= 0) { endRun(false, 'spins'); }
    // resolveSpin() parks the machine in 'resolving'. Without this transition
    // back to 'ready' the machine accepted exactly one spin per session and then
    // silently ignored every input: spin() bails unless the mode is 'ready'.
    if (mode === 'resolving') mode = 'ready';
  }

  function endRun(won, reason) {
    if (mode === 'over') return;
    mode = 'over';
    events.push({ t: 'over', won: won, balance: balance, reason: reason });
    if (window.DegenSound) DegenSound.play('game', won ? 'jackpot' : 'gameOver');
  }

  // ----------------------------------------------------------------- effects
  function burst(x, y, n, rgb) {
    for (var i = 0; i < n; i++) {
      var a = rng() * Math.PI * 2, sp = 60 + rng() * 320;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.5 + rng() * 0.7, maxLife: 1.2, size: 2 + rng() * 4,
        rgb: rgb, grav: 620, drag: 1.9
      });
    }
    if (particles.length > 400) particles.splice(0, 80);
  }

  function spark(reel, color) {
    var x = reelX(reel === reels[0] ? 0 : (reel === reels[1] ? 1 : 2)) + 90;
    var y = WINDOW_H / 2;
    burst(x, y, 10, color.replace('#', '').match(/../g).map(function (h) { return parseInt(h, 16); }).join(','));
  }

  function addFloater(x, y, text, color) {
    floaters.push({ x: x, y: y, text: text, color: color, life: 1.5, maxLife: 1.5 });
    if (floaters.length > 10) floaters.shift();
  }

  function say(msg, color) {
    message = msg; messageColor = color || '#ffd166'; messageTimer = 2.2;
  }
  var messageColor = '#ffd166';

  function stepParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      var k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (var j = floaters.length - 1; j >= 0; j--) {
      var f = floaters[j];
      f.life -= dt; f.y -= 40 * dt;
      if (f.life <= 0) floaters.splice(j, 1);
    }
  }

  // ------------------------------------------------------------------ update
  function step(dt) {
    if (mode === 'menu' || mode === 'over') { stepParticles(dt); return; }
    t += dt;
    if (messageTimer > 0) messageTimer -= dt;

    if (mode === 'spinning') {
      for (var i = 0; i < 3; i++) {
        if (!reels[i].stopped) {
          // Later reels scroll slightly faster, so a single rhythm does not work
          // for all three and you have to actually watch each one.
          reels[i].pos += SCROLL * (1 + i * 0.13) * dt;
        }
      }
    }
    stepParticles(dt);
  }

  // ------------------------------------------------------------------ render
  function reelX(i) { return 40 + i * 216; }

  function drawCabinet() {
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b0710');
    bg.addColorStop(1, '#05060a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Reel housing.
    ctx.fillStyle = '#080510';
    ctx.fillRect(24, CABINET_TOP, W - 48, WINDOW_H + 36);
    ctx.strokeStyle = '#ff2d55';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff2d55';
    ctx.shadowBlur = 16;
    ctx.strokeRect(24, CABINET_TOP, W - 48, WINDOW_H + 36);
    ctx.shadowBlur = 0;
  }

  function drawReel(i) {
    var x = reelX(i);
    var y = CABINET_TOP + 18;
    var r = reels[i];

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 180, WINDOW_H);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, 180, WINDOW_H);

    // The strip: draw every cell that could be visible.
    var base = Math.floor(r.pos) - 1;
    for (var c = 0; c < 5; c++) {
      var stripIndex = base + c;
      var sym = SYMBOLS[((stripIndex % SYMBOLS.length) + SYMBOLS.length) % SYMBOLS.length];
      var cy = y + (stripIndex - r.pos) * CELL + CELL / 2 + CELL / 2;
      if (cy < y - CELL || cy > y + WINDOW_H + CELL) continue;

      ctx.globalAlpha = r.stopped ? 1 : 0.92;
      ctx.font = '58px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sym.glyph, x + 90, cy);

      // Payline highlight when this cell is the one under the line.
      var dist = Math.abs(cy - (y + WINDOW_H / 2));
      if (!r.stopped && dist < CELL * 0.5) {
        ctx.globalAlpha = 1 - dist / (CELL * 0.5);
        ctx.strokeStyle = sym.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 8, cy - CELL / 2 + 4, 164, CELL - 8);
      }
    }
    ctx.globalAlpha = 1;

    // Aiming aid: after reel 1 locks, light the target symbol on the others.
    if (i > 0 && locked[0] && !r.stopped) {
      var target = SYMBOLS[reels[0].index];
      for (var c2 = 0; c2 < 5; c2++) {
        var si = base + c2;
        if (((si % SYMBOLS.length) + SYMBOLS.length) % SYMBOLS.length !== reels[0].index) continue;
        var cy2 = y + (si - r.pos) * CELL + CELL;
        ctx.strokeStyle = target.color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 4, cy2 + CELL / 2);
        ctx.lineTo(x + 18, cy2 + CELL / 2 - 8);
        ctx.lineTo(x + 18, cy2 + CELL / 2 + 8);
        ctx.closePath();
        ctx.fillStyle = target.color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Motion blur streaks while spinning.
    if (!r.stopped && mode === 'spinning') {
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = '#ffffff';
      for (var b = 0; b < 8; b++) {
        ctx.fillRect(x + 6, y + ((b * 41 + (t * 900) % 41) % WINDOW_H), 168, 2);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Frame.
    ctx.strokeStyle = r.stopped ? '#00ff9d' : '#2b4a63';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 180, WINDOW_H);

    if (r.stopped) {
      ctx.strokeStyle = r.perfect ? '#ffd166' : 'rgba(0,255,157,0.4)';
      ctx.lineWidth = r.perfect ? 4 : 2;
      ctx.strokeRect(x - 3, y - 3, 186, WINDOW_H + 6);
    }
  }

  function drawPayline() {
    var y = CABINET_TOP + 18 + WINDOW_H / 2;
    ctx.strokeStyle = 'rgba(255,209,102,0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(W - 16, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawHud() {
    // The numbers live in the HTML console under the cabinet, so the canvas only
    // carries what has to be next to the reels: progress, the message and the
    // stop prompt.
    var barY = CABINET_TOP + WINDOW_H + 48;
    var frac = clamp((balance - 0) / TARGET, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(34, barY, W - 68, 12);
    ctx.fillStyle = frac >= 1 ? '#ffd166' : '#00ff9d';
    ctx.fillRect(34, barY, (W - 68) * frac, 12);

    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7b93a6';
    ctx.fillText('$0', 34, barY + 30);
    ctx.textAlign = 'right';
    ctx.fillText('TARGET $' + TARGET.toLocaleString(), W - 34, barY + 30);
    ctx.textAlign = 'left';

    if (messageTimer > 0) {
      ctx.textAlign = 'center';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillStyle = messageColor;
      ctx.shadowColor = messageColor;
      ctx.shadowBlur = 12;
      ctx.fillText(message, W / 2, 30);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
    }

    // Stop prompt.
    if (mode === 'spinning') {
      var next = locked[0] ? (locked[1] ? 2 : 1) : 0;
      ctx.textAlign = 'center';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = '#00ff9d';
      ctx.fillText('STOP REEL ' + (next + 1) + '   [SPACE]', W / 2, barY + 30);
    }
    ctx.textAlign = 'left';
  }

  function render() {
    var sx = 0, sy = 0;
    if (shake > 0.001) {
      var mag = shake * shake * 10;
      sx = (rng() - 0.5) * mag; sy = (rng() - 0.5) * mag;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(sx, sy);
    drawCabinet();
    for (var i = 0; i < 3; i++) drawReel(i);
    drawPayline();
    drawHud();

    for (var p = 0; p < particles.length; p++) {
      var q = particles[p];
      ctx.globalAlpha = clamp(q.life / q.maxLife, 0, 1);
      ctx.fillStyle = 'rgb(' + q.rgb + ')';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (var f = 0; f < floaters.length; f++) {
      var fl = floaters[f];
      ctx.globalAlpha = clamp(fl.life / fl.maxLife, 0, 1);
      ctx.font = 'bold 20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = fl.color;
      ctx.shadowColor = fl.color; ctx.shadowBlur = 12;
      ctx.fillText(fl.text, fl.x, fl.y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
    ctx.restore();

    if (flash > 0.001) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.35) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drainEvents() {
    if (!events.length) return;
    var list = events.slice();
    events.length = 0;
    for (var i = 0; i < list.length; i++) if (onEvent) onEvent(list[i]);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    var delta = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!paused) {
      acc += delta;
      var steps = 0;
      while (acc >= STEP && steps < 8) { step(STEP); acc -= STEP; steps++; }
      if (acc > STEP * 8) acc = 0;
    }
    if (shake > 0) shake = Math.max(0, shake - delta * 2.2);
    if (flash > 0) flash = Math.max(0, flash - delta * 3);
    if (ctx) render();
    drainEvents();
  }

  // ------------------------------------------------------------- public API
  function newGame() {
    balance = START_BALANCE;
    bet = MIN_BET;
    spinsLeft = MAX_SPINS;
    peak = START_BALANCE;
    history = [];
    particles = []; floaters = [];
    lastWin = 0; lastResults = null;
    message = ''; messageTimer = 0;
    resetReels();
    mode = 'ready';
    events.push({ t: 'start' });
    return snapshot();
  }

  function spin() {
    if (mode !== 'ready') return null;
    if (spinsLeft <= 0) return null;

    // Auto-drop the stake to the largest affordable step. Previously this just
    // returned, so once the balance fell under the chosen bet the machine sat
    // there refusing to spin and the run never ended: an unreachable lose state.
    var affordable = Math.floor(balance / BET_STEP) * BET_STEP;
    var stake = clamp(Math.round(bet / BET_STEP) * BET_STEP, MIN_BET, Math.min(MAX_BET, affordable));
    if (stake < MIN_BET || balance < MIN_BET) { endRun(false, 'broke'); return null; }
    if (stake !== bet) { bet = stake; events.push({ t: 'bet', bet: bet }); say('STAKE CUT TO $' + bet, '#ffd166'); }

    // The stake comes out now. Without this the player could never lose money on
    // a spin, which made losing impossible and the whole machine pointless.
    balance -= bet;
    lastBet = bet;
    for (var i = 0; i < 3; i++) { reels[i].stopped = false; reels[i].perfect = false; }
    locked = [false, false, false];
    lastWin = 0; lastResults = null;
    mode = 'spinning';
    if (window.DegenSound) DegenSound.play('game', 'spin');
    events.push({ t: 'spinstart', bet: bet });
    return snapshot();
  }

  function setBet(v) {
    if (mode !== 'ready') return bet;
    var affordable = Math.floor(balance / BET_STEP) * BET_STEP;
    if (affordable < MIN_BET) return bet;
    bet = clamp(Math.round(v / BET_STEP) * BET_STEP, MIN_BET, Math.min(MAX_BET, affordable));
    events.push({ t: 'bet', bet: bet });
    return bet;
  }

  function snapshot() {
    return {
      mode: mode,
      t: +t.toFixed(2),
      balance: balance,
      target: TARGET,
      bet: bet,
      spinsLeft: spinsLeft,
      peak: peak,
      reels: reels.map(function (r) {
        return { pos: +r.pos.toFixed(3), stopped: r.stopped, index: r.index, perfect: r.perfect, offset: +r.offsetWithin.toFixed(3) };
      }),
      last: lastResults,
      scrollCellsPerSec: SCROLL,
      skill: 'reel timing'
    };
  }

  window.render_game_to_text = function () { return JSON.stringify(snapshot()); };

  var residual = 0;
  window.advanceTime = function (ms) {
    residual += ms / 1000;
    var steps = Math.floor(residual / STEP);
    residual -= steps * STEP;
    for (var i = 0; i < steps; i++) { step(STEP); drainEvents(); }
    if (ctx) render();
    return snapshot();
  };

  window.SlotsGame = {
    newGame: newGame,
    spin: spin,
    stopReel: stopReel,
    setBet: setBet,
    snapshot: snapshot,
    onEvent: function (fn) { onEvent = fn; },
    // Tests drive the reels to an exact strip position, which is the only way to
    // assert on timing skill without depending on wall-clock reaction time.
    setReelPos: function (i, pos) { reels[i].pos = pos; },
    symbols: SYMBOLS,
    constants: {
      START_BALANCE: START_BALANCE, TARGET: TARGET, MAX_SPINS: MAX_SPINS,
      MIN_BET: MIN_BET, MAX_BET: MAX_BET, CELL: CELL, SCROLL: SCROLL, PERFECT: PERFECT,
      TWO_PAY: TWO_PAY, W: W, H: H
    },
    _step: function (dt) { step(dt); drainEvents(); }
  };

  window.SlotsBoot = function (canvas) {
    ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    resetReels();
    if (!lastFrame) { lastFrame = 0; requestAnimationFrame(frame); }
    return window.SlotsGame;
  };
})();
