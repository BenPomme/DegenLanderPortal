/* ===========================================================================
   NERD SOCCER: arena, physics and match loop

   Physics rewrite. The original advanced everything by a fixed amount per frame
   (`x += dx`, `dy += gravity`), so the game ran faster on a 144 Hz monitor. Ball
   spin was applied as `y += spin * 0.05`, which is not a force. Contact set the
   ball's velocity to `speed * (cos, sin)` of the centre-to-centre angle, which
   discards the tangential component entirely, so every touch fully redirected
   the ball no matter the angle. Walls were perfectly elastic, and the whole
   bottom 120 px of each wall counted as a goal, with no posts to hit.

   Now: SI units, a fixed 120 Hz step with an accumulator and interpolated
   rendering, quadratic air drag, a real Magnus force from spin, Coulomb friction
   at contacts that converts spin into velocity the way a real ball does, and
   goalposts the ball can rebound off.
   =========================================================================== */
(function () {
  'use strict';

  var AI = window.SoccerAI;

  // ---------------------------------------------------------------- constants
  var W = 900, H = 520;              // logical canvas
  var PPM = 60;                      // pixels per metre
  var STEP = 1 / 120;
  var MAX_STEPS = 8;
  var GRAVITY = 9.81;

  var FLOOR_Y = H - 30;
  var GOAL_H = 132;                  // 2.2 m
  var GOAL_TOP = FLOOR_Y - GOAL_H;
  var POST_R = 5;

  // Ball: size 5 futsal ball.
  var BALL_R = 0.11 * PPM;           // 6.6 px
  var BALL_M = 0.43;
  var BALL_I = 0.4 * BALL_M * (0.11 * 0.11);   // solid sphere

  var PLAYER_R = 0.34 * PPM;         // 20.4 px
  var PLAYER_M = 70;

  // Drag: a = -k * v * |v|, with k = 0.5*rho*Cd*A/m.
  var DRAG_K = 0.013;
  // Magnus: a = kM * spin * v, perpendicular to v. Tuned so visible curl needs
  // real spin, not a token amount.
  var MAGNUS_K = 0.0016;

  var REST_GROUND = 0.56;
  var REST_WALL = 0.72;
  var REST_POST = 0.78;
  var FRICTION_MU = 0.42;
  var ROLL_FRICTION = 0.55;

  var PLAYER_ACCEL = 42;
  var PLAYER_MAX = 6.2;
  var PLAYER_FRICTION = 9;
  var JUMP_V = 7.4;

  var BOT_KICK_SPEED = 17.5;
  var HUMAN_KICK_BONUS = 4.2;

  var WIN_SCORE = 5;

  // ------------------------------------------------------------------- state
  var ctx = null;
  var brain = null;
  var mode = 'menu';                 // menu | playing | goal | over
  var paused = false;
  var acc = 0, lastFrame = 0, t = 0;
  var shake = 0, flash = 0;
  var particles = [];
  var trail = [];
  var floaters = [];
  var goalPause = 0;
  var matchTime = 0;
  var twoPlayerStats = { player: 0, bot: 0, playerStreak: 0, botStreak: 0 };
  var seedBase = 20261006;
  var difficulty = 'medium';
  var onEvent = null;
  var events = [];

  var keys = { left: false, right: false, jump: false, jumpPressed: false };

  var ball = null, player = null, bot = null;

  // The shot the human is currently winding up. Captured at contact so the
  // intent model trains on the pose *before* the ball left.
  var pendingShot = null;
  var lastBotShot = null;

  // --------------------------------------------------------------- utilities
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }

  /** Where the goal line is for a given side, as a band index. */
  function bandForY(y) {
    var rel = (y - GOAL_TOP) / GOAL_H;
    if (rel < 1 / 3) return 0;
    if (rel < 2 / 3) return 1;
    return 2;
  }
  function bandCentreY(band) {
    return GOAL_TOP + GOAL_H * [0.17, 0.5, 0.83][band];
  }

  /**
   * Integrate a free ball forward to find which band of the goal plane it will
   * cross, and when. Uses the same drag and gravity as the live physics, so the
   * label the intent model trains on is the truth, not an approximation.
   */
  function projectToGoal(bx, by, vx, vy, spin, goalX) {
    var x = bx, y = by, dt = 1 / 120;
    var dir = goalX > bx ? 1 : -1;
    for (var i = 0; i < 600; i++) {
      var v = hypot(vx, vy);
      var ax = 0, ay = GRAVITY;
      if (v > 1e-6) {
        ax -= DRAG_K * v * vx;
        ay -= DRAG_K * v * vy;
        ax += MAGNUS_K * spin * -vy;
        ay += MAGNUS_K * spin * vx;
      }
      vx += ax * dt; vy += ay * dt;
      // Velocities are m/s, positions are pixels: scale on integration.
      x += vx * PPM * dt;
      y += vy * PPM * dt;

      // Test the goal plane BEFORE resolving the wall. The wall handler clamps
      // the ball back inside the arena, so doing it first meant the ball never
      // registered as crossing the line: every projected shot came back null.
      if (dir > 0 ? (x + BALL_R >= goalX) : (x - BALL_R <= goalX)) {
        if (y > GOAL_TOP && y < FLOOR_Y) {
          return { band: bandForY(y), time: i * dt, y: y };
        }
        // Hit the wall outside the mouth: it is not a shot on target.
        return null;
      }

      if (y + BALL_R > FLOOR_Y) { y = FLOOR_Y - BALL_R; vy = -vy * REST_GROUND; vx *= 0.86; }
      if (y - BALL_R < 0) { y = BALL_R; vy = -vy * REST_WALL; }
      if (x < BALL_R) { x = BALL_R; vx = Math.abs(vx) * REST_WALL; }
      if (x > W - BALL_R) { x = W - BALL_R; vx = -Math.abs(vx) * REST_WALL; }
    }
    return null;
  }

  // ------------------------------------------------------------------ physics
  function stepBall(dt) {
    var v = hypot(ball.vx, ball.vy);
    var ax = 0, ay = GRAVITY;
    if (v > 1e-6) {
      ax -= DRAG_K * v * ball.vx;
      ay -= DRAG_K * v * ball.vy;
      // Magnus force is perpendicular to velocity and signed by the spin.
      ax += MAGNUS_K * ball.spin * -ball.vy;
      ay += MAGNUS_K * ball.spin * ball.vx;
    }
    ball.vx += ax * dt;
    ball.vy += ay * dt;

    var nx = ball.x + ball.vx * PPM * dt;
    var ny = ball.y + ball.vy * PPM * dt;

    // Swept sub-stepping so a 20 m/s shot cannot tunnel through a wall or post.
    var dx = nx - ball.x, dy = ny - ball.y;
    var dist = hypot(dx, dy);
    var sub = Math.max(1, Math.ceil(dist / (BALL_R * 0.8)));
    for (var s = 1; s <= sub; s++) {
      var f = s / sub;
      ball.x = ball.x + dx * (1 / sub);
      ball.y = ball.y + dy * (1 / sub);
      collideWalls();
      collidePosts();
      if (mode === 'goal') return;
    }

    // Rolling on the floor bleeds energy and spin.
    if (ball.y + BALL_R >= FLOOR_Y - 0.5) {
      var roll = Math.exp(-ROLL_FRICTION * dt);
      ball.vx *= roll;
      ball.spin *= roll;
    }
    ball.spin *= Math.exp(-0.35 * dt);      // slow spin decay in flight
  }

  function collideWalls() {
    // Floor
    if (ball.y + BALL_R > FLOOR_Y) {
      ball.y = FLOOR_Y - BALL_R;
      if (ball.vy > 0) {
        var vn = -ball.vy;
        ball.vy = -ball.vy * REST_GROUND;
        // The floor's outward normal points up, so the tangential direction is
        // horizontal. Passing a horizontal normal here made friction act along
        // the vertical axis and cancel the rebound almost completely.
        applyContactFriction(vn, 0, -1);
      }
    }
    // Ceiling
    if (ball.y - BALL_R < 0) {
      ball.y = BALL_R;
      if (ball.vy < 0) {
        // Capture the incoming normal speed BEFORE flipping the sign, otherwise
        // the friction impulse is computed from a negative normal load and the
        // Coulomb clamp ends up with inverted bounds.
        var ceilSpeed = -ball.vy;
        ball.vy = ceilSpeed * REST_WALL;
        applyContactFriction(ceilSpeed, 0, 1);
      }
    }

    var inMouth = ball.y > GOAL_TOP && ball.y < FLOOR_Y;

    // Left wall
    if (ball.x - BALL_R < 0) {
      if (inMouth) { scoreGoal('bot'); return; }
      ball.x = BALL_R;
      if (ball.vx < 0) {
        var lSpeed = -ball.vx;
        ball.vx = lSpeed * REST_WALL;
        applyContactFriction(lSpeed, 1, 0);
      }
    }
    // Right wall
    if (ball.x + BALL_R > W) {
      if (inMouth) { scoreGoal('player'); return; }
      ball.x = W - BALL_R;
      if (ball.vx > 0) {
        var rSpeed = ball.vx;
        ball.vx = -rSpeed * REST_WALL;
        applyContactFriction(rSpeed, -1, 0);
      }
    }
  }

  /**
   * Coulomb friction at a contact.
   *
   * The velocity of the ball's contact point is tangential velocity plus the
   * surface speed from spin. Friction opposes that, and because it acts at a
   * radius it also changes the spin. This is what makes a backspun ball check
   * and a topspun ball kick forward off the floor.
   */
  function applyContactFriction(normalSpeed, nx, ny) {
    var tx = -ny, ty = nx;
    var vt = ball.vx * tx + ball.vy * ty;
    // Velocity of the material point touching the surface: the centre's
    // tangential velocity plus omega x r, and r points INTO the surface, which
    // makes this a MINUS. Writing `vt + spin*R` inverted the whole effect: a
    // sliding ball picked up backspin instead of topspin, and topspin braked
    // the ball instead of driving it on.
    var contactV = vt - ball.spin * BALL_R;
    if (Math.abs(contactV) < 1e-6) return;

    // Impulse that would exactly stop the contact point.
    var k = 1 / BALL_M + (BALL_R * BALL_R) / BALL_I;
    var jtStop = -contactV / k;
    // Coulomb cap. The normal load has to be a positive magnitude: a negative
    // one inverts the clamp bounds, and clamp() then returns the upper bound,
    // which lands the impulse on the wrong side and adds energy.
    var jn = Math.abs(BALL_M * normalSpeed * (1 + REST_GROUND));
    var limit = FRICTION_MU * jn;
    var jt = clamp(jtStop, -limit, limit);

    ball.vx += (jt / BALL_M) * tx;
    ball.vy += (jt / BALL_M) * ty;
    // The torque is r x F; with r pointing into the surface, that introduces a
    // second minus sign.
    ball.spin -= (jt * BALL_R) / BALL_I;
  }

  function collidePosts() {
    var posts = [
      { x: 0, y: GOAL_TOP },
      { x: W, y: GOAL_TOP }
    ];
    for (var i = 0; i < posts.length; i++) {
      var p = posts[i];
      var dx = ball.x - p.x, dy = ball.y - p.y;
      var d = hypot(dx, dy);
      if (d < BALL_R + POST_R && d > 1e-6) {
        var nx = dx / d, ny = dy / d;
        ball.x = p.x + nx * (BALL_R + POST_R);
        ball.y = p.y + ny * (BALL_R + POST_R);
        var vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          ball.vx -= (1 + REST_POST) * vn * nx;
          ball.vy -= (1 + REST_POST) * vn * ny;
          shake = Math.min(1, shake + 0.25);
          if (window.DegenSound) DegenSound.play('game', 'hit');
        }
      }
    }
  }

  function stepPlayer(p, dt, moveDir) {
    if (moveDir !== 0) {
      p.vx += moveDir * PLAYER_ACCEL * dt;
      p.vx = clamp(p.vx, -PLAYER_MAX, PLAYER_MAX);
    } else {
      var f = Math.exp(-PLAYER_FRICTION * dt);
      p.vx *= f;
      if (Math.abs(p.vx) < 0.02) p.vx = 0;
    }

    p.vy += GRAVITY * dt;
    p.x += p.vx * PPM * dt;
    p.y += p.vy * PPM * dt;

    if (p.y + PLAYER_R > FLOOR_Y) {
      p.y = FLOOR_Y - PLAYER_R;
      p.vy = 0;
      p.grounded = true;
      p.doubleJump = true;
    } else {
      p.grounded = false;
    }
    if (p.x - PLAYER_R < 0) { p.x = PLAYER_R; p.vx = Math.max(0, p.vx); }
    if (p.x + PLAYER_R > W) { p.x = W - PLAYER_R; p.vx = Math.min(0, p.vx); }
    if (p.y - PLAYER_R < 0) { p.y = PLAYER_R; p.vy = Math.max(0, p.vy); }
  }

  function collidePlayers() {
    var dx = bot.x - player.x, dy = bot.y - player.y;
    var d = hypot(dx, dy);
    var min = PLAYER_R * 2;
    if (d < min && d > 1e-6) {
      var nx = dx / d, ny = dy / d;
      var overlap = min - d;
      player.x -= nx * overlap / 2;
      player.y -= ny * overlap / 2;
      bot.x += nx * overlap / 2;
      bot.y += ny * overlap / 2;
      // Exchange the normal components; equal masses, mostly inelastic.
      var pvn = player.vx * nx + player.vy * ny;
      var bvn = bot.vx * nx + bot.vy * ny;
      if (pvn - bvn > 0) {
        var e = 0.35;
        var j = -(1 + e) * (bvn - pvn) / 2;
        player.vx += j * nx; player.vy += j * ny;
        bot.vx -= j * nx; bot.vy -= j * ny;
      }
    }
  }

  /**
   * Ball against a player. The player is 160x heavier than the ball, so the ball
   * takes almost all of the impulse, which is what makes a running kick feel
   * powerful. The offset of the contact point from the player's centre sets the
   * spin, exactly as it would in reality.
   */
  /**
   * Pure version of the contact resolution, with no side effects.
   *
   * `collidePlayerBall` below and the headless warm-up both call this, so the
   * AI is pretrained against exactly the same kick model that the live match
   * uses. Sharing one implementation is the only way that promise stays true.
   */
  function contactOutcome(px, py, pvx, pvy, bx, by, bvx, bvy, isHuman) {
    var dx = bx - px, dy = by - py;
    var d = hypot(dx, dy);
    if (d < 1e-6) d = 1e-6;
    var nx = dx / d, ny = dy / d;

    var rvx = bvx - pvx, rvy = bvy - pvy;
    var vn = rvx * nx + rvy * ny;
    var outVx = bvx, outVy = bvy;

    if (vn < 0) {
      var e = 0.55;
      var impulse = -(1 + e) * vn / (1 / BALL_M + 1 / PLAYER_M);
      outVx += (impulse / BALL_M) * nx;
      outVy += (impulse / BALL_M) * ny;
    }
    var approach = Math.max(0, -vn);
    var bonus = (isHuman ? HUMAN_KICK_BONUS : 2.4) + approach * 0.35;
    outVx += nx * bonus;
    outVy += ny * bonus;

    var tx = -ny, ty = nx;
    var lever = (rvx * tx + rvy * ty);
    var spin = clamp(lever * 2.4 / BALL_R * 0.35, -140, 140);
    return { vx: outVx, vy: outVy, spin: spin, normalX: nx, normalY: ny, approach: approach };
  }

  function collidePlayerBall(p, isHuman) {
    var dx = ball.x - p.x, dy = ball.y - p.y;
    var d = hypot(dx, dy);
    var min = BALL_R + PLAYER_R;
    if (d >= min || d < 1e-6) return;

    var out = contactOutcome(p.x, p.y, p.vx, p.vy, ball.x, ball.y, ball.vx, ball.vy, isHuman);
    ball.x = p.x + out.normalX * min;
    ball.y = p.y + out.normalY * min;
    ball.vx = out.vx;
    ball.vy = out.vy;
    ball.spin = clamp(ball.spin + out.spin, -140, 140);

    var approach = out.approach;
    shake = Math.min(1, shake + 0.12 + Math.min(0.25, approach * 0.03));
    burst(ball.x, ball.y, 7, '255,235,150');
    if (window.DegenSound) DegenSound.play('game', approach > 4 ? 'shoot' : 'hit');

    if (isHuman) onHumanContact(p);
    else onBotContact(p);
  }

  // ------------------------------------------------------------- shot record
  /** Snapshot the pre-contact situation, for the intent model to learn from. */
  function snapshotObs(shooter) {
    var h = brain.intent.histogram();
    return {
      sx: shooter.x / W,
      sy: shooter.y / H,
      svx: shooter.vx,
      svy: shooter.vy,
      bx: ball.x / W,
      by: ball.y / H,
      bvx: ball.vx,
      bvy: ball.vy,
      dx: (ball.x - shooter.x) / W,
      dy: (ball.y - shooter.y) / H,
      histHigh: h[0],
      histMid: h[1],
      histLow: h[2],
      scoreDiff: twoPlayerStats.player - twoPlayerStats.bot
    };
  }

  function onHumanContact(p) {
    // Only count it as a shot if the ball is now travelling toward the bot's goal.
    if (ball.vx < 1.5) return;
    var obs = pendingShot || snapshotObs(p);
    pendingShot = null;
    var proj = projectToGoal(ball.x, ball.y, ball.vx, ball.vy, ball.spin, W);
    if (!proj) return;
    // Every shot the human takes is one training example.
    var loss = brain.observeHumanShot(obs, proj.band);
    events.push({ t: 'humanShot', band: proj.band, loss: loss });
  }

  function onBotContact(p) {
    if (ball.vx > -1.5) return;          // must be going toward the human's goal
    var band = brain.lastAttackAction == null ? 1 : brain.lastAttackAction;
    lastBotShot = { band: band, time: t };
    aimBotShot(band);
    events.push({ t: 'botShot', band: band });
  }

  /**
   * Solve the ballistic launch angle that puts the ball on the chosen band of
   * the human's goal, then apply it. Real projectile maths, so the bot's choice
   * of band is a real choice with real consequences.
   */
  function aimBotShot(band) {
    var targetX = -8;                    // just behind the goal line
    var targetY = bandCentreY(band);
    var dx = targetX - ball.x;
    var dy = targetY - ball.y;
    var s = BOT_KICK_SPEED;
    var g = GRAVITY;
    var disc = s * s * s * s - g * (g * dx * dx + 2 * dy * s * s);
    if (disc < 0 || Math.abs(dx) < 1) {
      // Out of range: shoot straight at the target.
      var d = hypot(dx, dy) || 1;
      ball.vx = dx / d * s;
      ball.vy = dy / d * s;
    } else {
      var tanTheta = (s * s - Math.sqrt(disc)) / (g * dx);
      var theta = Math.atan(tanTheta);
      // dx is negative (shooting left), so flip the sign of the horizontal part.
      var dirX = dx < 0 ? -1 : 1;
      ball.vx = dirX * s * Math.cos(theta);
      ball.vy = -s * Math.sin(theta);
    }
    ball.spin = 0;
  }

  // ------------------------------------------------------------------- goals
  function scoreGoal(side) {
    if (mode === 'goal') return;
    mode = 'goal';
    goalPause = 1.5;
    shake = 1;
    flash = 0.8;
    var gx = side === 'player' ? W : 0;
    burst(gx, ball.y, 46, side === 'player' ? '0,255,157' : '255,45,85');

    if (side === 'player') {
      twoPlayerStats.player++;
      twoPlayerStats.playerStreak++;
      twoPlayerStats.botStreak = 0;
      // The bot conceded: its defensive policy gets a negative reward.
      brain.rewardDefence(-1, null);
      if (lastBotShot) brain.rewardAttack(false);
    } else {
      twoPlayerStats.bot++;
      twoPlayerStats.botStreak++;
      twoPlayerStats.playerStreak = 0;
      brain.rewardDefence(1, null);
      if (lastBotShot) brain.rewardAttack(true);
    }
    lastBotShot = null;
    if (window.DegenSound) DegenSound.play('game', 'jackpot');
    events.push({ t: 'goal', side: side, player: twoPlayerStats.player, bot: twoPlayerStats.bot });
    if (twoPlayerStats.player >= WIN_SCORE || twoPlayerStats.bot >= WIN_SCORE) {
      mode = 'over';
      brain.episodes++;
      brain.save();
      events.push({
        t: 'over',
        winner: twoPlayerStats.player >= WIN_SCORE ? 'player' : 'bot',
        player: twoPlayerStats.player, bot: twoPlayerStats.bot
      });
    }
  }

  function resetPositions() {
    ball.x = W / 2; ball.y = H * 0.32;
    ball.vx = 0; ball.vy = 0; ball.spin = 0;
    player.x = W * 0.28; player.y = FLOOR_Y - PLAYER_R;
    player.vx = 0; player.vy = 0;
    bot.x = W * 0.72; bot.y = FLOOR_Y - PLAYER_R;
    bot.vx = 0; bot.vy = 0;
    trail.length = 0;
    pendingShot = null;
    lastBotShot = null;
  }

  // --------------------------------------------------------------------- bot
  var botThink = { moveDir: 0, wantJump: false, actionName: 'hold', nextThink: 0 };

  /**
   * Decide how the bot plays this instant.
   *
   * Defence is where the learning shows: the intent model reads where the human
   * is about to shoot, the Q-table decides which of the five defensive actions
   * actually saves goals, and the two are blended. Attack picks a target band
   * with a second Q-table that is rewarded for scoring.
   */
  function botControl(dt) {
    if (t < botThink.nextThink) return;
    botThink.nextThink = t + 0.06;

    var ballToBotGoal = -1;                     // bot defends the left goal
    var danger = ball.vx < -1.2 && ball.x < W * 0.62;
    var attacking = ball.x > W * 0.45;

    if (danger) {
      var obs = snapshotObs(player);
      var ballDistNorm = clamp(ball.x / W, 0, 1);
      var botOffsetNorm = clamp((bot.x - W * 0.18) / (W * 0.4), -1, 1);
      var decision = brain.decideDefence(obs, ballDistNorm, botOffsetNorm);
      botThink.actionName = decision.actionName;

      var wantY = GOAL_TOP + GOAL_H * 0.5;
      switch (decision.actionName) {
        case 'dashHigh': wantY = GOAL_TOP + GOAL_H * 0.1; break;
        case 'high': wantY = GOAL_TOP + GOAL_H * 0.32; break;
        case 'hold': wantY = GOAL_TOP + GOAL_H * 0.5; break;
        case 'low': wantY = GOAL_TOP + GOAL_H * 0.7; break;
        case 'dashLow': wantY = GOAL_TOP + GOAL_H * 0.92; break;
      }
      var targetX = clamp(ball.x - 26, PLAYER_R, W * 0.55);
      botThink.moveDir = Math.abs(targetX - bot.x) > 8 ? Math.sign(targetX - bot.x) : 0;
      // Jump if the ball is high and coming in over our head.
      botThink.wantJump = (bot.y > wantY + 10) && ball.y < bot.y - 20 && ball.y > GOAL_TOP - 40;
    } else if (attacking) {
      // Line up behind the ball relative to the human's goal, then strike.
      var aimX = ball.x + 34;
      var behind = ball.y < bot.y - 6;
      botThink.moveDir = clamp((aimX - bot.x) / 40, -1, 1) * (Math.abs(aimX - bot.x) > 10 ? 1 : 0);
      botThink.wantJump = behind && Math.abs(ball.x - bot.x) < 90;
      // Ask the attack policy where to place it, ready for the next contact.
      var h = brain.intent.histogram();
      brain.decideAttack({ sy: clamp(player.y / H, 0, 1), histHigh: h[0], histMid: h[1], histLow: h[2], scoreDiff: 0 });
    } else {
      var mid = W * 0.5;
      botThink.moveDir = Math.abs(mid - bot.x) > 30 ? Math.sign(ball.x - bot.x) : 0;
      botThink.wantJump = false;
    }
  }

  // --------------------------------------------------------------- particles
  function burst(x, y, n, rgb) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 60 + Math.random() * 260;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: 0.4 + Math.random() * 0.6, maxLife: 1.0,
        size: 1.5 + Math.random() * 3, rgb: rgb, grav: 700, drag: 1.8
      });
    }
    if (particles.length > 400) particles.splice(0, 80);
  }

  function addFloater(x, y, text, color) {
    floaters.push({ x: x, y: y, text: text, color: color, life: 1.6, maxLife: 1.6 });
    if (floaters.length > 12) floaters.shift();
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
      f.life -= dt; f.y -= 34 * dt;
      if (f.life <= 0) floaters.splice(j, 1);
    }
  }

  // ------------------------------------------------------------------ update
  function step(dt) {
    if (mode === 'menu' || mode === 'over') return;
    if (mode === 'goal') {
      goalPause -= dt;
      if (goalPause <= 0) { mode = 'playing'; resetPositions(); }
      stepParticles(dt);
      return;
    }

    t += dt;
    matchTime += dt;

    // Record the pre-contact pose every frame so it is ready if contact happens.
    pendingShot = snapshotObs(player);

    var moveDir = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    if (keys.jumpPressed && player.grounded) {
      player.vy = -JUMP_V; player.grounded = false; keys.jumpPressed = false;
    } else if (keys.jumpPressed && player.doubleJump) {
      player.vy = -JUMP_V * 0.85;
      player.doubleJump = false;
      keys.jumpPressed = false;
      burst(player.x, player.y + PLAYER_R, 8, '120,200,255');
    }

    stepPlayer(player, dt, moveDir);

    botControl(dt);
    if (botThink.wantJump && bot.grounded) { bot.vy = -JUMP_V; bot.grounded = false; }
    stepPlayer(bot, dt, botThink.moveDir);

    collidePlayers();
    stepBall(dt);
    if (mode === 'goal' || mode === 'over') { stepParticles(dt); return; }

    collidePlayerBall(player, true);
    collidePlayerBall(bot, false);

    // Ball trail, for reading fast movement.
    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 22) trail.shift();

    stepParticles(dt);
  }

  // ------------------------------------------------------------------ render
  function drawArena() {
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#04070e');
    sky.addColorStop(0.6, '#07101c');
    sky.addColorStop(1, '#0a1526');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Arena glow from the two goals.
    var lg = ctx.createRadialGradient(0, GOAL_TOP + GOAL_H / 2, 0, 0, GOAL_TOP + GOAL_H / 2, 260);
    lg.addColorStop(0, 'rgba(255,45,85,0.16)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    var rg = ctx.createRadialGradient(W, GOAL_TOP + GOAL_H / 2, 0, W, GOAL_TOP + GOAL_H / 2, 260);
    rg.addColorStop(0, 'rgba(0,255,157,0.16)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    // Floor.
    var floor = ctx.createLinearGradient(0, FLOOR_Y, 0, H);
    floor.addColorStop(0, '#0d2a22');
    floor.addColorStop(1, '#061410');
    ctx.fillStyle = floor;
    ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    ctx.strokeStyle = '#00ff9d';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, FLOOR_Y); ctx.lineTo(W, FLOOR_Y); ctx.stroke();

    // Ceiling and walls.
    ctx.strokeStyle = 'rgba(0,255,157,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.stroke();

    // Goal mouths with net hatching.
    drawGoal(0, '#ff2d55');
    drawGoal(W, '#00ff9d');

    // Centre circle and halfway line.
    ctx.strokeStyle = 'rgba(0,255,157,0.16)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 12]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, FLOOR_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(W / 2, FLOOR_Y, 96, Math.PI, 0); ctx.stroke();
  }

  function drawGoal(x, color) {
    var dir = x === 0 ? 1 : -1;
    // Net.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x === 0 ? 0 : W - 34, GOAL_TOP, 34, GOAL_H);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 34; i += 7) {
      ctx.beginPath(); ctx.moveTo(x === 0 ? i : W - 34 + i, GOAL_TOP); ctx.lineTo(x === 0 ? i : W - 34 + i, FLOOR_Y); ctx.stroke();
    }
    for (var j = 0; j <= GOAL_H; j += 7) {
      ctx.beginPath(); ctx.moveTo(x === 0 ? 0 : W - 34, GOAL_TOP + j); ctx.lineTo(x === 0 ? 34 : W, GOAL_TOP + j); ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(x, GOAL_TOP);
    ctx.lineTo(x, FLOOR_Y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Crossbar post.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, GOAL_TOP, POST_R, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Show the bot's current read of the human, on the human's own goal. */
  function drawPrediction() {
    if (!brain || mode !== 'playing') return;
    var pred = brain.lastPrediction;
    if (!pred) return;
    var y = bandCentreY(pred.band);
    var h = GOAL_H / 3;
    var alpha = 0.10 + pred.confidence * 0.32;
    ctx.fillStyle = 'rgba(255,209,102,' + alpha + ')';
    ctx.fillRect(0, GOAL_TOP + pred.band * h, 30, h);
    ctx.strokeStyle = 'rgba(255,209,102,' + Math.min(0.9, alpha + 0.3) + ')';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.5, GOAL_TOP + pred.band * h + 0.5, 30, h - 1);
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(255,209,102,0.85)';
    ctx.fillText('READ ' + Math.round(pred.confidence * 100) + '%', 38, y + 3);
  }

  function drawBall() {
    // Trail.
    for (var i = 1; i < trail.length; i++) {
      var a = trail[i - 1], b = trail[i];
      ctx.strokeStyle = 'rgba(255,209,102,' + (i / trail.length) * 0.34 + ')';
      ctx.lineWidth = 1 + (i / trail.length) * 2.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rot || 0);
    var g = ctx.createRadialGradient(-BALL_R * 0.35, -BALL_R * 0.35, BALL_R * 0.1, 0, 0, BALL_R);
    g.addColorStop(0, '#fffdf0');
    g.addColorStop(1, '#e8b93c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fill();
    // Panels, so the spin is visible.
    ctx.fillStyle = 'rgba(20,16,4,0.8)';
    for (var k = 0; k < 3; k++) {
      var ang = k * Math.PI * 2 / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * BALL_R * 0.45, Math.sin(ang) * BALL_R * 0.45, BALL_R * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(60,45,10,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Spin indicator ring, so curl is legible.
    if (Math.abs(ball.spin) > 12) {
      var r = BALL_R + 5;
      var dir = ball.spin > 0 ? 1 : -1;
      ctx.strokeStyle = ball.spin > 0 ? 'rgba(0,229,255,0.85)' : 'rgba(176,38,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, r, dir > 0 ? 0 : Math.PI * 0.2, dir > 0 ? Math.PI * 1.4 : Math.PI * 1.6);
      ctx.stroke();
    }
  }

  function drawPlayer(p, color, label) {
    ctx.save();
    var g = ctx.createRadialGradient(p.x - PLAYER_R * 0.3, p.y - PLAYER_R * 0.35, PLAYER_R * 0.1, p.x, p.y, PLAYER_R);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Heading marker, so you can see which way they are driving.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + clamp(p.vx / PLAYER_MAX, -1, 1) * PLAYER_R * 0.9,
               p.y + clamp(p.vy / 12, -1, 1) * PLAYER_R * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  function drawHud() {
    ctx.save();
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillStyle = '#00ff9d';
    ctx.fillText(String(twoPlayerStats.player), W / 2 - 42, 30);
    ctx.fillStyle = '#ff2d55';
    ctx.fillText(String(twoPlayerStats.bot), W / 2 + 26, 30);
    ctx.fillStyle = 'rgba(214,255,239,0.5)';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('FIRST TO ' + WIN_SCORE, W / 2 - 46, 48);

    if (mode === 'playing') {
      ctx.fillStyle = 'rgba(123,147,166,0.8)';
      ctx.fillText('SPEED ' + hypot(ball.vx, ball.vy).toFixed(1) + ' m/s', 12, 22);
      ctx.fillText('SPIN ' + ball.spin.toFixed(0), 12, 38);
    }
    ctx.restore();
  }

  function render() {
    var sx = 0, sy = 0;
    if (shake > 0.001) {
      var mag = shake * shake * 12;
      sx = (Math.random() - 0.5) * mag;
      sy = (Math.random() - 0.5) * mag;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(sx, sy);
    drawArena();
    drawPrediction();
    drawBall();
    drawPlayer(player, '#1E90FF', 'P');
    drawPlayer(bot, '#32CD32', 'B');

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = 'rgba(' + p.rgb + ',1)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (var j = 0; j < floaters.length; j++) {
      var f = floaters[j];
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.font = 'bold 18px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color; ctx.shadowBlur = 12;
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    drawHud();
    ctx.restore();

    if (flash > 0.001) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.4) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (paused) {
      ctx.fillStyle = 'rgba(2,4,8,0.66)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffd166';
      ctx.fillText('PAUSED', W / 2, H / 2);
      ctx.textAlign = 'left';
    }
  }

  function drainEvents() {
    if (!events.length) return;
    var list = events.slice();
    events.length = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].t === 'goal') {
        addFloater(W / 2, H * 0.4, list[i].side === 'player' ? 'GOAL!' : 'CONCEDED',
                   list[i].side === 'player' ? '#00ff9d' : '#ff2d55');
      }
      if (onEvent) onEvent(list[i]);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    var delta = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;

    if (!paused && mode !== 'menu') {
      acc += delta;
      var steps = 0;
      while (acc >= STEP && steps < MAX_STEPS) {
        step(STEP);
        acc -= STEP;
        steps++;
      }
      if (acc > STEP * MAX_STEPS) acc = 0;
    }
    if (shake > 0) shake = Math.max(0, shake - delta * 2.1);
    if (flash > 0) flash = Math.max(0, flash - delta * 3);
    if (ball) { ball.rot = (ball.rot || 0) + ball.spin * delta; }
    if (ctx) render();
    drainEvents();
  }

  // ------------------------------------------------------------- public API
  function makeEntity(x, y) {
    return { x: x, y: y, vx: 0, vy: 0, grounded: true, doubleJump: true };
  }

  function newMatch(opts) {
    opts = opts || {};
    difficulty = opts.difficulty || difficulty;
    twoPlayerStats = { player: 0, bot: 0, playerStreak: 0, botStreak: 0 };
    player = makeEntity(W * 0.28, FLOOR_Y - PLAYER_R);
    bot = makeEntity(W * 0.72, FLOOR_Y - PLAYER_R);
    ball = { x: W / 2, y: H * 0.32, vx: 0, vy: 0, spin: 0, rot: 0 };
    particles = []; floaters = []; trail = [];
    t = 0; matchTime = 0; acc = 0;
    mode = 'playing';
    paused = false;
    if (!brain) brain = new AI.Brain(seedBase);
    events.push({ t: 'start' });
    return snapshot();
  }

  function snapshot() {
    return {
      mode: mode,
      paused: paused,
      t: +t.toFixed(2),
      coordSystem: 'origin top-left, +x right, +y down, metres at 60 px/m',
      score: { player: twoPlayerStats.player, bot: twoPlayerStats.bot },
      ball: ball ? {
        x: +(ball.x / PPM).toFixed(3), y: +(ball.y / PPM).toFixed(3),
        vx: +ball.vx.toFixed(3), vy: +ball.vy.toFixed(3),
        speed: +hypot(ball.vx, ball.vy).toFixed(3),
        spin: +ball.spin.toFixed(2)
      } : null,
      player: player ? { x: +(player.x / PPM).toFixed(3), y: +(player.y / PPM).toFixed(3), vx: +player.vx.toFixed(3), vy: +player.vy.toFixed(3) } : null,
      bot: bot ? { x: +(bot.x / PPM).toFixed(3), y: +(bot.y / PPM).toFixed(3), vx: +bot.vx.toFixed(3), vy: +bot.vy.toFixed(3), action: botThink.actionName } : null,
      goalTop: +(GOAL_TOP / PPM).toFixed(2),
      goalHeight: +(GOAL_H / PPM).toFixed(2)
    };
  }

  window.render_game_to_text = function () { return JSON.stringify(snapshot()); };

  var testResidual = 0;
  window.advanceTime = function (ms) {
    if (!ball) return snapshot();
    testResidual += ms / 1000;
    var steps = Math.floor(testResidual / STEP);
    testResidual -= steps * STEP;
    for (var i = 0; i < steps; i++) {
      step(STEP);
      drainEvents();
    }
    if (ball) ball.rot = (ball.rot || 0) + (ms / 1000) * ball.spin;
    if (ctx) render();
    return snapshot();
  };

  window.SoccerGame = {
    newMatch: newMatch,
    snapshot: snapshot,
    brain: function () { return brain; },
    onEvent: function (fn) { onEvent = fn; },
    setBrain: function (b) { brain = b; },
    keys: keys,
    setKey: function (name, val) {
      if (name === 'jump' && val && !keys.jump) keys.jumpPressed = true;
      keys[name] = val;
    },
    resetPositions: resetPositions,
    // Exposed for tests and for the headless warm-up.
    projectToGoal: projectToGoal,
    contactOutcome: contactOutcome,
    PLAYER_R: PLAYER_R,
    BOT_KICK_SPEED: BOT_KICK_SPEED,
    physics: { BALL_R: BALL_R, BALL_M: BALL_M, GRAVITY: GRAVITY, DRAG_K: DRAG_K, MAGNUS_K: MAGNUS_K, FLOOR_Y: FLOOR_Y, GOAL_TOP: GOAL_TOP, GOAL_H: GOAL_H, W: W, H: H, PPM: PPM, REST_GROUND: REST_GROUND },
    setBall: function (x, y, vx, vy, spin) {
      ball.x = x; ball.y = y; ball.vx = vx; ball.vy = vy; ball.spin = spin || 0;
    },
    getBall: function () { return ball; },
    serve: function () { mode = 'playing'; resetPositions(); },
    _stepOnce: function (dt) { step(dt); drainEvents(); },
    // Ball-only integration, for tests that need to isolate the ball's own
    // physics. Without this a player kick (which legitimately does work on the
    // ball) shows up as an energy gain and masks real problems.
    _stepBallOnly: function (dt) { stepBall(dt); }
  };

  window.SoccerBoot = function (canvas) {
    ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    brain = new AI.Brain(seedBase);
    brain.load();
    player = makeEntity(W * 0.28, FLOOR_Y - PLAYER_R);
    bot = makeEntity(W * 0.72, FLOOR_Y - PLAYER_R);
    ball = { x: W / 2, y: H * 0.32, vx: 0, vy: 0, spin: 0, rot: 0 };
    if (!lastFrame) { lastFrame = 0; requestAnimationFrame(frame); }
    return brain;
  };
})();
