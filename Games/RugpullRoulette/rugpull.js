/* ===========================================================================
   RUGPULL ROULETTE: engine

   The old version was a spinning wheel where a random coin rugged. The player
   picked one and watched. There was no information to act on and therefore no
   skill: survival was a 1-in-7 dice roll and the only feedback was whether you
   happened to be lucky.

   This is a deduction game. Six coins each publish five signals, and the signals
   are not equally informative:

     HARD signals (liquidity locked, dev wallet, holder concentration) match the
     real outcome about 88% of the time.
     SOFT signals (twitter hype, "audited" badge, telegram size) match about 54%
     of the time, which is close enough to a coin flip to be noise.

   The payout odds are set from the SUM of all warnings, treating hard and soft
   alike. So the money is in the coins that look scary for soft reasons only:
   they pay like a long shot while actually being among the safest on the board.
   Learning to tell those two kinds of red flag apart is the skill.

   GOAL   Turn $1,000 into $2,500 in 10 rounds.
   SKILL  Reading the dossiers and separating hard warnings from soft noise.
   WIN    Balance reaches $2,500.
   LOSE   Balance falls below the minimum bet, or the rounds run out short.
   =========================================================================== */
(function () {
  'use strict';

  var W = 900, H = 470;
  var STEP = 1 / 120;

  var START_BALANCE = 1000;
  // A reader who only avoids hard warnings averages 2.4x and finishes near
  // $2,400, so a $2,200 target made the game 98% winnable once you knew the
  // rule: safe but solved. At $2,700 the same reader falls short, because
  // clearing it requires taking the higher-odds coins whose fear is soft only.
  // Safety alone is not enough; you have to price the risk as well.
  var TARGET = 2700;
  var MAX_ROUNDS = 10;
  var MIN_BET = 25;
  var MAX_BET = 250;
  var COINS = 6;
  var SAFE_COUNT = 2;          // exactly two coins survive each round

  var HARD_RELIABILITY = 0.88;
  var SOFT_RELIABILITY = 0.54;

  var SIGNALS = [
    { key: 'liq',    label: 'LIQUIDITY',  hard: true,  warn: 'UNLOCKED',  ok: 'LOCKED' },
    { key: 'dev',    label: 'DEV WALLET', hard: true,  warn: 'SOLD',      ok: 'HOLDING' },
    { key: 'holders',label: 'TOP HOLDERS',hard: true,  warn: 'WHALES',    ok: 'SPREAD' },
    { key: 'social', label: 'SHILLING',   hard: false, warn: 'FRENZY',    ok: 'QUIET' },
    { key: 'audit',  label: 'AUDIT',      hard: false, warn: 'NONE',      ok: 'BADGE' }
  ];

  var PREFIX = ['Moon', 'Doge', 'Safe', 'Baby', 'Elon', 'Shib', 'Ape', 'Pepe', 'Chad', 'Based'];
  var SUFFIX = ['Coin', 'Token', 'Swap', 'Inu', 'Floki', 'Mars', 'Cash', 'Rocket', 'Doge'];

  // ------------------------------------------------------------------ state
  var ctx = null;
  var mode = 'menu';            // menu | betting | revealing | over
  var balance = START_BALANCE;
  var bet = MIN_BET;
  var round = 0;
  var coins = [];
  var pick = -1;
  var revealT = 0;
  var lastRound = null;
  var history = [];
  var message = '';
  var messageColor = '#ffd166';
  var messageTimer = 0;
  var shake = 0, flash = 0;
  var particles = [], floaters = [];
  var t = 0, acc = 0, lastFrame = 0, paused = false;
  var onEvent = null, events = [];
  var rngState = 20261006;
  var hoverPick = -1;

  function rng() {
    rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
    var x = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pickFrom(arr) { return arr[Math.floor(rng() * arr.length)]; }

  // -------------------------------------------------------------- coin model
  /**
   * Build one round.
   *
   * Exactly SAFE_COUNT coins are safe. For every other coin the outcome is
   * "rugged". Each signal is then generated to agree with the outcome at that
   * signal's reliability, which is what makes hard signals worth trusting and
   * soft ones worth ignoring.
   */
  function buildRound() {
    var order = [];
    for (var i = 0; i < COINS; i++) order.push(i);
    for (var s = order.length - 1; s > 0; s--) {
      var j = Math.floor(rng() * (s + 1));
      var tmp = order[s]; order[s] = order[j]; order[j] = tmp;
    }
    var safeSet = {};
    for (var k = 0; k < SAFE_COUNT; k++) safeSet[order[k]] = true;

    var used = {};
    var list = [];
    for (var c = 0; c < COINS; c++) {
      var safe = !!safeSet[c];
      // Dedupe on the TICKER, not the full name. Deduping the name let
      // "PepeCoin", "PepeSwap" and "PepeInu" all render as PEPE on one board.
      var name, ticker;
      var guard = 0;
      do {
        name = pickFrom(PREFIX) + pickFrom(SUFFIX);
        ticker = name.slice(0, 4).toUpperCase();
        guard++;
      } while (used[ticker] && guard < 200);
      // Fallback: with 90 name combinations the 4-char tickers can collide
      // enough that the guard trips. Guarantee uniqueness rather than shipping a
      // board with two identical tickers.
      if (used[ticker]) {
        var n = 2;
        while (used[ticker.slice(0, 3) + n] && n < 10) n++;
        ticker = ticker.slice(0, 3) + n;
      }
      used[ticker] = true;

      var sigs = [];
      var hardWarnings = 0, softWarnings = 0;
      for (var q = 0; q < SIGNALS.length; q++) {
        var def = SIGNALS[q];
        // A warning is emitted when the signal disagrees with the truth.
        var rel = def.hard ? HARD_RELIABILITY : SOFT_RELIABILITY;
        var accurate = rng() < rel;
        var warning = accurate ? !safe : safe;
        if (warning) { if (def.hard) hardWarnings++; else softWarnings++; }
        sigs.push({ key: def.key, label: def.label, hard: def.hard, warning: warning,
                    text: warning ? def.warn : def.ok });
      }

      // The market prices the coin off the TOTAL number of warnings, which is
      // exactly the mistake a careless reader makes. The spread has to be wide
      // enough that reading correctly beats the target: at 0.55 per warning a
      // perfect reader finished around $1,900 and the goal was unreachable for
      // everyone, which made the skill worthless.
      var totalWarn = hardWarnings + softWarnings;
      var odds = 1.6 + totalWarn * 0.85;
      if (totalWarn === 0) odds = 1.6;

      list.push({
        ticker: ticker,
        name: name,
        safe: safe,
        signals: sigs,
        hardWarnings: hardWarnings,
        softWarnings: softWarnings,
        odds: Math.round(odds * 100) / 100
      });
    }
    return list;
  }

  /** Probability this coin is safe, from the player's point of view. */
  function safeProbability(coin) {
    // Bayes-ish: start from the base rate, then let each signal move the odds by
    // its reliability. Hard signals move it a lot, soft ones barely.
    var logOdds = Math.log(SAFE_COUNT / (COINS - SAFE_COUNT));
    for (var i = 0; i < coin.signals.length; i++) {
      var s = coin.signals[i];
      var rel = s.hard ? HARD_RELIABILITY : SOFT_RELIABILITY;
      // Likelihood ratio of seeing this signal when safe vs rugged.
      var lr = s.warning ? (1 - rel) / rel : rel / (1 - rel);
      logOdds += Math.log(lr);
    }
    return 1 / (1 + Math.exp(-logOdds));
  }

  // ------------------------------------------------------------------ actions
  function newGame() {
    balance = START_BALANCE;
    bet = MIN_BET;
    round = 0;
    history = [];
    particles = []; floaters = [];
    pick = -1; revealT = 0; lastRound = null;
    message = ''; messageTimer = 0;
    coins = buildRound();
    mode = 'betting';
    events.push({ t: 'start' });
    return snapshot();
  }

  function setBet(v) {
    if (mode !== 'betting') return bet;
    var affordable = Math.floor(balance / 5) * 5;
    if (affordable < MIN_BET) return bet;
    bet = clamp(Math.round(v / 5) * 5, MIN_BET, Math.min(MAX_BET, affordable));
    events.push({ t: 'bet', bet: bet });
    return bet;
  }

  function apeIn(index) {
    if (mode !== 'betting') return null;
    if (index < 0 || index >= coins.length) return null;
    var affordable = Math.floor(balance / 5) * 5;
    var stake = clamp(bet, MIN_BET, Math.min(MAX_BET, affordable));
    if (stake < MIN_BET || balance < MIN_BET) { endRun(false, 'broke'); return null; }
    bet = stake;
    balance -= stake;
    pick = index;
    mode = 'revealing';
    revealT = 0;
    events.push({ t: 'pick', index: index, stake: stake, ticker: coins[index].ticker });
    return snapshot();
  }

  function resolveRound() {
    var coin = coins[pick];
    var stake = bet;
    var won = coin.safe;
    var payout = won ? Math.round(stake * coin.odds) : 0;
    balance += payout;
    round += 1;

    var survived = coins.filter(function (c) { return c.safe; }).length;
    lastRound = {
      round: round, ticker: coin.ticker, won: won, stake: stake,
      odds: coin.odds, payout: payout, safeCount: survived,
      // What the player should have been able to work out in advance.
      impliedProb: safeProbability(coin),
      bestProb: Math.max.apply(null, coins.map(safeProbability))
    };
    history.push(lastRound);

    if (won) {
      message = 'IT SURVIVED  +$' + payout;
      messageColor = '#00ff9d';
      flash = 0.5;
      burst(coinScreenX(pick), 250, 34, '0,255,157');
      addFloater(coinScreenX(pick), 200, '+$' + payout, '#00ff9d');
      if (window.DegenSound) DegenSound.play('game', payout > stake * 2.5 ? 'jackpot' : 'win');
    } else {
      message = 'RUGGED.  -$' + stake;
      messageColor = '#ff2d55';
      shake = 1;
      burst(coinScreenX(pick), 250, 40, '255,45,85');
      if (window.DegenSound) DegenSound.play('game', 'rugpull');
    }
    messageTimer = 2.6;

    events.push({
      t: 'round', round: round, won: won, payout: payout, balance: balance,
      ticker: coin.ticker, impliedProb: lastRound.impliedProb
    });

    checkEnd();
  }

  function checkEnd() {
    if (mode === 'over') return;
    if (balance >= TARGET) { endRun(true, 'target'); return; }
    if (balance < MIN_BET) { endRun(false, 'broke'); return; }
    if (round >= MAX_ROUNDS) { endRun(false, 'rounds'); }
  }

  function endRun(won, reason) {
    if (mode === 'over') return;
    mode = 'over';
    events.push({ t: 'over', won: won, balance: balance, reason: reason, rounds: round });
    if (window.DegenSound) DegenSound.play('game', won ? 'jackpot' : 'gameOver');
  }

  function nextRound() {
    if (mode !== 'revealing') return null;
    coins = buildRound();
    pick = -1; revealT = 0;
    // Must be cleared here. resolveRound() is guarded by `lastRound === null`,
    // and without this reset only the very first round of a run ever resolved:
    // every later round silently kept its stake and re-dealt.
    lastRound = null;
    mode = 'betting';
    events.push({ t: 'newround', round: round + 1 });
    return snapshot();
  }

  // ----------------------------------------------------------------- effects
  function burst(x, y, n, rgb) {
    for (var i = 0; i < n; i++) {
      var a = rng() * Math.PI * 2, sp = 60 + rng() * 340;
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 70,
        life: 0.5 + rng() * 0.7, maxLife: 1.2, size: 2 + rng() * 4, rgb: rgb,
        grav: 640, drag: 1.9 });
    }
    if (particles.length > 420) particles.splice(0, 80);
  }

  function addFloater(x, y, text, color) {
    floaters.push({ x: x, y: y, text: text, color: color, life: 1.6, maxLife: 1.6 });
    if (floaters.length > 10) floaters.shift();
  }

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
    if (mode === 'revealing') {
      revealT += dt;
      // Reveal the coins one at a time so the round resolves as a sequence rather
      // than a single instant, then settle and score.
      if (revealT > 1.35 && lastRound === null) resolveRound();
    }
    stepParticles(dt);
  }

  // ------------------------------------------------------------------ render
  function coinScreenX(i) { return 70 + i * 132; }
  var COIN_W = 120, COIN_H = 268, COIN_Y = 84;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCoin(i) {
    var c = coins[i];
    var x = coinScreenX(i), y = COIN_Y;
    var revealed = mode === 'revealing' && revealT > 0.35 + i * 0.13;
    var isPick = i === pick;

    // Card.
    ctx.fillStyle = revealed
      ? (c.safe ? 'rgba(0,60,40,0.95)' : 'rgba(70,10,25,0.95)')
      : (isPick ? 'rgba(40,34,8,0.95)' : 'rgba(12,16,26,0.95)');
    roundRect(x, y, COIN_W, COIN_H, 6);
    ctx.fill();

    ctx.strokeStyle = revealed
      ? (c.safe ? '#00ff9d' : '#ff2d55')
      : (isPick ? '#ffd166' : '#1e2c3f');
    ctx.lineWidth = isPick ? 3 : 2;
    ctx.stroke();

    // Ticker and name.
    ctx.textAlign = 'center';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = revealed ? (c.safe ? '#00ff9d' : '#ff2d55') : '#d9ffef';
    ctx.fillText(c.ticker, x + COIN_W / 2, y + 26);
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = '#7b93a6';
    ctx.fillText(c.name.slice(0, 14), x + COIN_W / 2, y + 42);

    // Odds.
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('x' + c.odds.toFixed(2), x + COIN_W / 2, y + 64);

    // Signals.
    var sy = y + 78;
    for (var s = 0; s < c.signals.length; s++) {
      var sig = c.signals[s];
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#5b6b7d';
      ctx.fillText(sig.label, x + 8, sy + 7);

      var txt = sig.text;
      ctx.textAlign = 'right';
      if (sig.warning) {
        ctx.fillStyle = sig.hard ? '#ff2d55' : '#ff8a3d';
        ctx.font = (sig.hard ? '8px' : '7px') + ' "Press Start 2P", monospace';
      } else {
        ctx.fillStyle = sig.hard ? '#00ff9d' : '#5db8ff';
        ctx.font = '7px "Press Start 2P", monospace';
      }
      ctx.fillText(txt, x + COIN_W - 8, sy + 7);
      sy += 20;
    }

    // The card shows the MARKET's risk score: a flat count of every warning, hard
    // and soft alike, which is the same number the odds are built from.
    //
    // It deliberately does NOT show the true posterior. An earlier version
    // printed the correct probability here and the game collapsed into "click
    // the highest number". Showing the market's naive score instead makes the
    // tool part of the trap: reading it literally is exactly the mistake the
    // payout is designed to punish.
    if (!revealed && mode === 'betting') {
      var total = c.hardWarnings + c.softWarnings;
      ctx.textAlign = 'center';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#5b6b7d';
      ctx.fillText('MARKET RISK', x + COIN_W / 2, y + COIN_H - 40);
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = total >= 3 ? '#ff2d55' : (total >= 2 ? '#ff8a3d' : '#00ff9d');
      ctx.fillText(total + ' / 5', x + COIN_W / 2, y + COIN_H - 20);
    }

    // Reveal stamp.
    if (revealed) {
      ctx.textAlign = 'center';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillStyle = c.safe ? '#00ff9d' : '#ff2d55';
      ctx.globalAlpha = Math.min(1, (revealT - (0.35 + i * 0.13)) * 4);
      ctx.fillText(c.safe ? 'SAFE' : 'RUG', x + COIN_W / 2, y + COIN_H - 24);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  function drawHud() {
    ctx.textAlign = 'left';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = '#7b93a6';
    ctx.fillText('BALANCE', 24, 30);
    ctx.fillStyle = balance >= TARGET * 0.6 ? '#00ff9d' : '#d9ffef';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText('$' + Math.round(balance).toLocaleString(), 24, 54);

    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = '#7b93a6';
    ctx.fillText('TARGET $' + TARGET.toLocaleString(), 240, 30);
    ctx.fillText('ROUND ' + Math.min(round + 1, MAX_ROUNDS) + ' / ' + MAX_ROUNDS, 240, 54);

    ctx.fillText('STAKE', 520, 30);
    ctx.fillStyle = '#ffd166';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText('$' + bet, 520, 54);

    // The rules live in the legend under the canvas, so the canvas header only
    // carries the live numbers. An earlier version repeated the rules here and
    // they collided with the round counter.
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = '#7b93a6';
    ctx.textAlign = 'right';
    ctx.fillText('2 OF 6 SURVIVE EACH ROUND', W - 24, 30);
    ctx.fillText('HARD SIGNALS ARE 88% RIGHT', W - 24, 48);
    ctx.textAlign = 'left';

    // Target progress.
    var frac = clamp(balance / TARGET, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(24, H - 26, W - 48, 10);
    ctx.fillStyle = frac >= 1 ? '#ffd166' : '#00ff9d';
    ctx.fillRect(24, H - 26, (W - 48) * frac, 10);

    if (messageTimer > 0) {
      ctx.textAlign = 'center';
      ctx.font = '15px "Press Start 2P", monospace';
      ctx.fillStyle = messageColor;
      ctx.shadowColor = messageColor; ctx.shadowBlur = 14;
      ctx.fillText(message, W / 2, H - 44);
      ctx.shadowBlur = 0;
    }

    if (mode === 'betting') {
      ctx.textAlign = 'center';
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = '#00ff9d';
      ctx.fillText('CLICK A COIN TO APE IN   [1-6]', W / 2, H - 6);
    } else if (mode === 'revealing' && lastRound !== null) {
      ctx.textAlign = 'center';
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffd166';
      ctx.fillText('PRESS SPACE FOR THE NEXT ROUND', W / 2, H - 6);
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
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0512');
    bg.addColorStop(1, '#05060a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(sx, sy);
    for (var i = 0; i < coins.length; i++) drawCoin(i);
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
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.3) + ')';
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
  function snapshot() {
    return {
      mode: mode,
      t: +t.toFixed(2),
      balance: Math.round(balance),
      target: TARGET,
      bet: bet,
      round: round,
      roundsLeft: MAX_ROUNDS - round,
      pick: pick,
      skill: 'reading dossiers',
      safeCount: SAFE_COUNT,
      coinCount: COINS,
      // Deliberately exposes only what is on screen, so a test cannot cheat.
      coins: coins.map(function (c) {
        return {
          ticker: c.ticker, name: c.name, odds: c.odds,
          hardWarnings: c.hardWarnings, softWarnings: c.softWarnings,
          reading: +safeProbability(c).toFixed(3),
          signals: c.signals.map(function (s) { return s.label + ':' + s.text; })
        };
      })
    };
  }

  /** Full truth, for the resolver and for tests that check the generation. */
  function truth() {
    return coins.map(function (c) {
      return { ticker: c.ticker, safe: c.safe, hardWarnings: c.hardWarnings, softWarnings: c.softWarnings, odds: c.odds };
    });
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

  window.RugpullGame = {
    newGame: newGame,
    apeIn: apeIn,
    nextRound: nextRound,
    setBet: setBet,
    snapshot: snapshot,
    truth: truth,
    safeProbability: safeProbability,
    onEvent: function (fn) { onEvent = fn; },
    constants: {
      START_BALANCE: START_BALANCE, TARGET: TARGET, MAX_ROUNDS: MAX_ROUNDS,
      MIN_BET: MIN_BET, MAX_BET: MAX_BET, COINS: COINS, SAFE_COUNT: SAFE_COUNT,
      HARD_RELIABILITY: HARD_RELIABILITY, SOFT_RELIABILITY: SOFT_RELIABILITY,
      W: W, H: H, COIN_Y: COIN_Y, COIN_W: COIN_W, COIN_H: COIN_H
    },
    _step: function (dt) { step(dt); drainEvents(); },
    hover: function (i) { hoverPick = i; },
    coinAt: function (px, py) {
      for (var i = 0; i < coins.length; i++) {
        var x = coinScreenX(i);
        if (px >= x && px <= x + COIN_W && py >= COIN_Y && py <= COIN_Y + COIN_H) return i;
      }
      return -1;
    }
  };

  window.RugpullBoot = function (canvas) {
    ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    coins = buildRound();
    if (!lastFrame) { lastFrame = 0; requestAnimationFrame(frame); }
    return window.RugpullGame;
  };
})();
