# DegenLander Portal: Revival

Original prompt: "You will study this repo https://github.com/BenPomme/DegenLanderPortal/ and revive it.
fix the games, make them better and better looking, make the whole environment super degen, publish on
pages free, and then come up with 10 big ideas to make it more viral and fun. find the right skills to
make it better"

## Audit findings (verified in Chromium, not assumed)

### Why the site is dead
- `CNAME` contains `degenlander.com`. That domain no longer resolves (`dig` returns nothing).
- GitHub Pages therefore 301-redirects *everything* to `https://degenlander.com/`, which does not load.
- `https://benpomme.github.io/DegenLanderPortal/` returns `301 -> https://degenlander.com/` = dead.
- The `Deploy to GitHub Pages` workflow has **never run** (0 workflow runs). Pages is served straight
  from the `gh-pages` branch.

### Fatal JS errors (page completely dead)
| Page | Error | Cause |
|---|---|---|
| `Games/SpaceshipWorld/home.html` | `SyntaxError: Invalid or unexpected token` | `\!` written instead of `!` (21 occurrences) + `<\<!DOCTYPE` puts page in quirks mode (`BackCompat`) |
| `Games/AntsSimulator/script-init.js` | `SyntaxError: Invalid or unexpected token` | `\!` written instead of `!` |
| `Games/RugpullRoulette/index.html` | `SyntaxError: Unexpected identifier 've'` | unescaped apostrophes inside single-quoted strings (`'You've got'`) |
| `Games/degenlander/game.html` | `SyntaxError: Identifier 'playerName' has already been declared` | `const playerName` declared in two sibling classic scripts |
| `leaderboard.html` | `ReferenceError: process is not defined` | `config.js` uses `process.env` in a browser |

### Verified gameplay state (Chromium, start-clicked)
- PLAYS: degenlander (index.html), ants (but broken layout), nerdsoccer, cryptoshitter
- BLANK: degenlander (game.html), spaceship
- STUCK: rugpull (syntax error), slots (needs correct start button, re-verify)

### Other defects
- Absolute `/js/...` paths in 4 games break any project-page hosting.
- `js/sound-effects.js` points every single sound at the same MDN t-rex roar URL.
- Dead third-party assets: `via.placeholder.com` (gone), `i.imgflip.com/1bij.jpg` (404),
  `cdn.jsdelivr.net/npm/tailwindcss@3.3.2` (ORB-blocked), `soundjay.com/fart-01.mp3` (ORB-blocked).
- Homepage is unstyled-feeling: flat centred link list, overlapping "NEW!" badge, no game art.
- Nav bar on every game omits half the games and uses root-absolute links.
- `Games/AntsSimulator/index.html` chart canvases report `height: 33554432` (broken layout math).

## Plan
1. Shared degen design system (`css/degen.css`) + rewritten `js/degen-theme.js` core.
2. Real local sound engine (`js/sound-effects.js`) using `/sounds/*.mp3` + Web Audio synthesis.
3. Fix every fatal bug above; make all 9 games playable.
4. Rebuild homepage as a proper degen arcade; unify nav; add game art.
5. Remove dead CNAME, publish to GitHub Pages free URL, verify live.
6. Write the 10 viral ideas doc.

## Notes / gotchas
- Playwright browsers are not installed; use `executablePath` = Google Chrome
  (`/Applications/Google Chrome.app/...`). Scripts in `.scratch/audit/`.
- Local server: `python3 -m http.server 8811` from repo root.
- All games must use **relative** asset paths so they work on a project page.

## Status: complete

- [x] Full browser audit of 15 pages
- [x] Shared design system (`css/degen.css`, self-hosted font)
- [x] Game bug fixes: all 8 games play (verified by start-click + canvas animation probe)
- [x] Visual overhaul: new arcade, new leaderboard, restyled games, procedural art
- [x] Published to GitHub Pages free URL, 15/15 pages clean live
- [x] 10 viral ideas (`docs/VIRAL-IDEAS.md`)
- [x] Mobile pass: all checked pages render at a true 390px with no overflow

## What was actually broken (all verified, not guessed)

1. `CNAME` -> `degenlander.com`, whose DNS no longer resolves. Pages 301'd the whole
   site to a dead domain. Also cleared the stale `cname` from the Pages API config,
   not just the file.
2. Six fatal JS errors: `\!` over-escaping (SpaceshipWorld x21, ants script-init),
   unescaped apostrophes (RugpullRoulette), duplicate `const` (degenlander/game.html
   twice), `process.env` in the browser (config.js).
3. SpaceshipWorld's `gameLoop()` was defined but never called, so the canvas never
   painted even after the syntax error was fixed.
4. Four pages had no viewport meta tag, so mobile Chrome used a 980px layout
   viewport and they rendered as unreadable thumbnails.
5. `sounds/*.mp3` were committed as 0-byte files.
6. Dead CDNs: via.placeholder.com, i.imgflip.com, jsdelivr Tailwind,
   soundjay.com, and a TensorFlow.js bundle loaded only to call one unused line.
7. The Firebase Realtime Database is gone (`{"error":"404 Not Found"}`), so the
   cross-device leaderboard could never have worked.
8. Ants Simulator chart canvases grew to 33,554,432px tall because Chart.js was
   told `maintainAspectRatio:false` inside a scrolling flex column with no height.
9. A nav/body feedback loop: the nav's `min-height` used the same CSS variable the
   height measurement wrote, so it ran away to 900px on flex-body game pages.

## Verification harness (in `.scratch/audit/`, gitignored)

- `audit.js`     loads all 15 pages, records console/page errors and failed requests
- `play.js`      clicks each game's start control and samples the canvas twice to
                 prove the render loop is alive (catches "loads clean but dead")
- `mobile.js`    390px pass, checks for layout-viewport expansion and h-overflow
- `wide4.js`     finds the specific element forcing the layout viewport wider
- `score-test.js` end-to-end score submit then read back on the leaderboard

Run the site with `python3 -m http.server 8811` from the repo root first.
Playwright's bundled browsers are not installed on this machine; the scripts
launch Google Chrome via `executablePath` instead.

## Still open / ideas for whoever picks this up

- The leaderboard is per-browser (`localStorage`). A shared board is the main thing
  standing between this and real virality. See `docs/VIRAL-IDEAS.md`; the top three
  ideas are share cards, a daily shared seed, and challenge links.
- Challenge links (idea 3) are half-built: `Games/degenlander/` already accepts
  `?seed=&diff=&ticker=`, so a link can reproduce an exact landing site. What is
  missing is the "beat my score" banner and the head-to-head result.
- `Games/degenlander/` contains four overlapping variants (index, game, simple-game,
  direct-game, test-stocks). `index.html` is the one the arcade links to. The others
  are reachable but are not linked from the portal nav; they could be consolidated.
- `Games/laby/labirinthgame.html` is still in French (it was never linked before this
  revival). It is now in the nav as "NEON LABYRINTH" under an English title.
- The `.d-crt` scanline overlay is a `position:fixed` element with `mix-blend-mode`.
  It is cheap, but worth re-measuring on low-end Android if FPS ever matters.

---

## Degen Lander: engine rewrite (2026-10-06)

`Games/degenlander/index.html` was rebuilt around a new simulation engine in
`Games/degenlander/lander.js` (~1350 lines). The old version is recoverable from
git history; it was replaced rather than patched because the physics model itself
was the problem.

### What was wrong with the old one

- **No delta-time anywhere.** Position, velocity, rotation and fuel were all
  incremented by a fixed amount per frame, so the game ran 2.4x fast on a 144 Hz
  monitor and slowly on a 30 Hz one.
- **Gravity was 0.02 px/frame²**, about 72 px/s². The ship drifted down like a
  leaf; there was no sense of mass.
- **Rotation had no angular momentum.** The angle was changed directly and the
  velocity vector was never rotated with the ship, so thrusting while turning did
  nothing interesting.
- **Score was `+= 1` per frame**, doubled by holding Space. The optimal strategy
  was to hover as long as possible, which is the exact opposite of a landing game.
- **The landing test was wrong in three ways:** it sampled three points that were
  not the hull or the legs, it compared the ship's angle to zero instead of to the
  terrain slope, and `rotation % (2*Math.PI) < 0.3` is false for every negative
  angle, so one direction of tilt could never land.

### What the new engine does

- **Fixed 120 Hz integration** with an accumulator, interpolated for rendering, so
  the simulation is identical at any refresh rate. Verified: 1x1000 ms and
  25x40 ms produce bit-identical state.
- **Real units.** The playfield is 40 m x 30 m at 20 px/m; gravity is 1.78 m/s²,
  thrust 4.3 m/s², and both are scaled per site and difficulty.
- **Thrust along the ship's axis**, with a proportional throttle channel. The
  keyboard maps onto that channel as 0 or 1, so the feel is unchanged, but the
  engine is now throttleable.
- **Angular momentum**: RCS torque, damping, and a rate limit. The ship keeps
  spinning until you counter it.
- **Mass matters**: thrust-to-weight improves as fuel burns, so the last seconds
  of a tank behave differently from the first.
- **Swept collision** at ~0.28 m per sub-step, so nothing tunnels through the
  chart at high descent rates.
- **Five-condition landing test**, all shown live on the HUD: both legs down, hull
  never contacting, descent rate, sideways slide, tilt against the *local surface
  normal*, and residual spin.

### Challenges

A run is a ladder of landing sites rather than a single drop. Land, then bank the
score or double down onto a site with a smaller pad, stronger wind and tighter
limits. The beacon is a real target and precision is the biggest scoring term, so
the skill being rewarded is the skill the game is about.

### Verification

`.scratch/audit/lander-physics.js` runs 24 assertions against the analytic
solution, not against screenshots:

```
node .scratch/audit/lander-physics.js     # 24 passed, 0 failed
node .scratch/audit/lander-visual.js      # full flow + screenshots
```

It checks free fall against `v = g*t` and `y = ½g t²`, frame-rate independence,
that thrust acts along the ship's axis (two identical runs, one burning), angular
momentum, that fuel burn is proportional to simulated time, that an uncontrolled
descent crashes with a stated reason, and that a closed-loop guidance autopilot
can actually land. That last one is the important one: it proves the game is
winnable and that the envelope is not impossible to hit.

Three bugs were found by that suite rather than by looking at the screen:

1. `advanceTime` rounded each call to whole physics steps, so 25 calls of 40 ms
   integrated 125 steps instead of 120 and the physics looked frame-rate
   dependent. It now carries the remainder.
2. The landing test required both feet to cross the ground **in the same
   1/120 s sub-step**, which essentially never happens. A single leg touching
   first is normal and the gear should absorb it, so that is no longer fatal; the
   tilt check is what rejects a bad attitude.
3. The `scored` event was queued for the next drain, so the cash-out panel could
   arrive a step late or not at all. It is now delivered in the same pass.

---

## Nerd Soccer: physics and a real learning opponent (2026-10-06)

Rebuilt as `soccer-ai.js` (the learners) plus `soccer.js` (arena, physics, match)
with the page as a thin shell. The old file is in git history.

### What the old one actually did

- **No delta-time.** Ball and players advanced by a fixed amount per frame.
- **Spin was fake.** `y += spin * 0.05` adds spin straight to vertical velocity.
  There was no Magnus force and no friction coupling.
- **Contact discarded the tangential component.**
  `dx = speed * cos(angle)` set the ball's velocity along the centre-to-centre
  line every single touch, so the incoming angle never mattered.
- **Walls were perfectly elastic** (`dx *= -1`), and the whole bottom 120 px of
  each wall was a goal with no posts to hit.
- **The AI was not AI.** Jumps were `Math.random() < jumpProbability`, the
  prediction `ball.x + ball.dx * 60` ignored wall bounces entirely, and the
  `this.strategy = { playerGoals, botGoals, adjustPosition }` object was declared
  and then never written to.

### Physics now

Fixed 120 Hz step with an accumulator and interpolated rendering. Real units:
9.81 m/s^2, a 0.43 kg size-5 ball, quadratic air drag, a Magnus force from spin,
and Coulomb friction at contacts that converts spin into velocity. Goalposts the
ball rebounds off. Swept sub-stepping so a 60 m/s shot cannot tunnel.

Two sign errors and one unit error were caught by the test suite, not by eye:

1. Positions are pixels and velocities are m/s, and the integration never scaled
   by pixels-per-metre, so the ball moved 60x too slowly.
2. The contact-plane test in `projectToGoal` ran *after* the wall handler clamped
   the ball back inside, so every projected shot returned "not on target".
3. `applyContactFriction` was called with rotated normals (a horizontal normal for
   the floor, vertical for the walls), so the friction impulse acted on the wrong
   axis and cancelled the bounce. Bounce restitution measured 0.097 against a
   configured 0.314. It is now 0.292.
4. The rolling-contact velocity used `vt + spin*R` where the correct relation is
   `vt - spin*R`, and the spin update had a matching sign error. A sliding ball
   picked up *backspin* and topspin braked the ball instead of driving it on.

### The learning

Three learners, all measured:

- **`MLP`** (17 inputs, 26 hidden, 3 outputs). Softmax output, cross-entropy,
  momentum SGD. `gradCheck()` compares the analytic gradient to central finite
  differences; the maximum error is 2.2e-11, so the backprop is verified rather
  than assumed.
- **`IntentModel`** predicts which band of the goal you are about to attack from
  your pose and your history. Every shot you take is one training example, and a
  recency-weighted histogram tracks habits so a player who changes what they do
  is followed rather than averaged forever.
- **`QLearner`** twice: one for which defensive action saves, one for which band
  to shoot at. Rewards come from real goals and real saves during play.

The 17th, 16th and 15th inputs are derived contact geometry (the direction from
striker to ball and the closing speed). Without those the network was being asked
to infer the contact normal from a raw pose and could not do it from a few hundred
examples; the loss stayed at chance. Adding observable geometry is legitimate, it
is what a keeper actually sees, and it moved the loss from 1.043 to 0.697 against
a chance level of ln(3) = 1.099.

Everything persists to localStorage, and there is a "erase its memory" button so
the difference is visible.

### Verification

```
node .scratch/audit/mlp-check.js      # 9 passed: gradients, learning, persistence
node .scratch/audit/soccer-physics.js # 29 passed: physics + learning
node .scratch/audit/soccer-match.js   # headless match scorelines
```

The learning assertions are the point:

- intent accuracy reading a habitual shooter improves from 84% to 90%
- the histogram identifies the habit (87% low for an always-low shooter)
- keeper greedy save rate improves from 23% to 100% across 27 states
- the attack policy moves away from the keeper's strong side
- 12 strikes driven through the live game loop all reach the learner

The physics assertions are checked against independent reference calculations:
free fall against an RK4 integration of the same drag equation (0.05% agreement),
frame-rate independence between 1x1000 ms and 100x10 ms, mechanical energy that
never increases, restitution against e^2, Magnus curvature sign, and no
tunnelling at 60 m/s.

---

## Every other game: goal, skill, win, lose (2026-10-06)

The remaining six games were audited against the same bar as the lander and the
soccer game: does it have a stated goal, a named skill, and a reachable way to
win and to lose? Four of them failed that bar completely.

| Game | Before | Now |
|---|---|---|
| Degenerate Slots | no goal, pure RNG, could not be won | skill-stop reels, $1,000 to $2,000 in 22 spins |
| Rugpull Roulette | no goal, pure RNG, could not be won | read the dossiers, $1,000 to $2,700 in 10 rounds |
| Crypto Shitter | timer only, could not be won | $10,000 to $50,000 in 120 seconds |
| Spaceship World | crashes still advanced the round, could not be lost | 3 hulls, 5 landings to win |
| Ant Simulator | no objective at all | survive 5 waves of smarties |
| Neon Labyrinth | French, uncapped levels, no finish | 5 levels, one life |

### Degenerate Slots

The machine picked a random symbol per reel and compared them. The player had no
decisions and no influence. It is now a skill-stop machine: the reels scroll
continuously and you stop each one. Reel 1 sets the symbol you are chasing and
reels 2 and 3 light it up, so the aiming task is explicit. Scroll is driven by the
fixed timestep, so the timing window is identical at any refresh rate.

Three real bugs found while building it:

1. **The stake was never deducted**, so the player could not lose money and the
   machine was pointless.
2. **Falling below the bet wedged the game.** `spin()` returned early and nothing
   ended the run, so a broke player sat there forever. The stake now auto-drops
   to the largest affordable step, and below the minimum the run ends.
3. **`resolveSpin` never returned the machine to `ready`**, so exactly one spin
   per session was accepted and every later input was silently ignored.

The test sweeps reel accuracy and checks the win rate climbs with it:
20% -> 8%, 35% -> 50%, 55% -> 97%. Random placement wins 0 of 120.

### Rugpull Roulette

It span a wheel, a random coin rugged, and you watched. There was no information
to act on. It is now a deduction game: six coins publish five signals each, and
the signals are deliberately not equally informative. Liquidity, dev wallet and
holder concentration are hard signals and are right about 88% of the time.
Shilling and audit badges are soft and are right about 54%, which is noise.

The payout odds count every warning equally, which is the market's mistake. A
coin that looks terrifying for soft reasons only pays like a long shot while
actually being one of the safest on the board. Measured over 4,000 rounds: hard
signals 87.8% accurate, soft 54.1%, and a soft-scary safe coin pays 2.45x while a
hard-scary rugged one pays 2.84x.

The card shows the market's naive risk score, not the true posterior. An earlier
version printed the correct probability and the game collapsed into "click the
highest number"; showing the market's own number makes the tool part of the trap.

Two bugs: `nextRound()` never cleared `lastRound`, and `resolveRound` is guarded
by `lastRound === null`, so only the first round of a run ever resolved. And
tickers were deduped on the full name rather than the four-character ticker, so
boards shipped with three coins all labelled PEPE.

Win rate at a $100 stake: random picker 0 of 150, informed reader 66 of 150.

### Crypto Shitter

This one already had a real skill (timing a live price chart) but no target, so
no run could be won and the player had no idea what they were aiming at. It now
has a stated target of $50,000 from $10,000, a bust line at $1,000, and a results
panel that says plainly whether you won or lost and why. A test hook exposes the
closure state so the win path, the bust path and the clock path are all verified.

### Spaceship World

A crash advanced the round anyway, so five crashes still ended in "all 5 rounds
done". There was no way to lose. It now has three hulls: a wreck or a hard
touchdown costs one and you replay the round, and losing all three ends the run.
The HUD carries the hulls and the menu states the goal, the skill and both
outcomes.

### Ant Simulator

A sandbox with no objective. Seven smarties spawned once and the only terminal
state was every ant dying. It now runs five waves, each larger and with more
aggressive smarties, and clearing wave five wins. The tutorial states the goal
(survive 5 waves), the skill (resource management) and both outcomes.

### Neon Labyrinth

Still in French, with an uncapped level counter and a level-complete branch that
always opened the upgrade panel. A run could not be finished. It is now in
English, capped at five levels, and death ends the run rather than granting a
free retry of the level you just failed.

### Verification

```
node .scratch/audit/slots-check.js      # 15 passed
node .scratch/audit/rugpull-check.js    # 13 passed
node .scratch/audit/shitter-check.js    # 11 passed
node .scratch/audit/ship-check.js       #  6 passed
node .scratch/audit/ants-check.js       #  6 passed
node .scratch/audit/laby-check.js       #  8 passed
node .scratch/audit/audit.js            # 15/15 pages clean
```

The arcade cards now carry each game's goal and skill, so the objective is
visible before you click.

---

## Degen Lander: control model borrowed from moonlander.seb.ly (2026-10-12)

Studied the reference at http://moonlander.seb.ly/ (Seb Lee-Delisle, part of the
Lunar Trails project). Source read directly: `Lander.js`, `game.js`,
`LandscapeData.js`.

### What the reference actually does

```js
gravity = 0.0005, thrustAcceleration = 0.0015, topSpeed = 0.35, drag = 0.9997
thrustBuild += ((this.thrusting - thrustBuild) * 0.2);   // spool
targetRotation += direction * 15;                        // stepped, clamped +/-90
this.rotation += (targetRotation - this.rotation) * 0.3; // eased toward target
// landing gate: (lander.rotation == 0) && (lander.vel.y < 0.15)
```

It is a much simpler simulation than ours, and it is far easier to fly. Every
reason for that is on the **control** side, not the physics side:

1. **The engine spools.** `thrustBuild` lerps toward the command at 0.2 per
   frame instead of snapping. Real engines do spool, and it turns a binary key
   into a usable analogue control: a tap is a small correction, a hold is a full
   burn.
2. **Rotation is stepped and clamped.** Target angles are multiples of 15
   degrees, bounded to +/-90, and the actual angle eases toward the target. Two
   consequences matter: "level" is a discrete state you can always return to
   exactly, and you can never end up inverted with no way back.
3. **Speed is capped** (`topSpeed`), with `drag = 0.9997` applied on both axes
   every frame so motion damps rather than running away.
4. **The landing gate is `rotation == 0`**, which is only crisp because rotation
   is discrete.
5. **The ship must be fully inside the flat pad**, not hanging off an edge.

It also has a real bug: `if(vel.y>topSpeed) velY=topSpeed;` assigns to an
undeclared global `velY` instead of `vel.y`, so the speed clamp never fires. The
intent is there, the implementation does nothing.

### What we took, and how

The reference's physics are not better than ours. Its *controls* are better, and
the fix was to take those without giving up what this engine already does
properly.

| Borrowed | How it is implemented here |
|---|---|
| Engine spool | Throttle ramps at `spoolUp` 4.2/s igniting and `spoolDown` 5.6/s cutting, applied to the existing proportional throttle channel. |
| Stepped rotation | Rather than replacing angular momentum with a lerp, **detent assist** adds a restoring torque toward the nearest 15 degree step once the pilot releases the keys. Momentum survives; level is still easy. |
| +/-90 clamp | Assisted mode clamps attitude at horizontal, removing the one genuinely unrecoverable state. |
| Speed cap | Real quadratic drag, `dragK = 0.0215`, giving a terminal velocity of sqrt(g/k) = 8.8 m/s. More honest than the reference's linear drag, and unlike theirs it actually works. |
| Full-pad requirement | Already covered, more generally: the contact-plane normal means a ship straddling an edge reads as a steep tilt. |

**FULL DEGEN turns both assists off** and gives the raw physics, so the original
handling is still available.

### Verification

`node .scratch/audit/lander-physics.js` now runs 28 assertions, four of them new:

- drag matches an independent RK4 integration of `dv/dt = g - k*v^2` to 0.12%
  (sim 33.230 vs RK4 33.270 m/s after 0.25 s from 40 m/s)
- a ship launched above terminal speed decelerates toward it instead of
  accelerating
- one physics step of thrust changes vy by 0.010 m/s against 0.036 at full
  power, so the spool is real
- released rotation settles onto a detent (measured 0.10 degrees off the 15
  degree grid) and assisted mode stops at exactly 90.00 degrees

The free-fall assertion was rewritten: it used to compare against the drag-free
closed form `0.5*g*t^2`, which is no longer the right reference now that drag
exists.

Also removed while in here: the labyrinth's external Roboto request (Press Start
2P is self-hosted), three redundant Google Fonts links on pages that already
load `css/degen.css`, and the `game.html` meme pop-ups that hotlinked
i.imgflip.com and therefore rendered as broken-image icons.

---

## The four-lander problem, and a proper port of the reference rotation

### What went wrong

The first pass at "borrowing from the reference" was too timid, and it was aimed
at the wrong file.

`Games/degenlander/` contained **four near-identical builds of the game**:
`index.html` (the rebuilt one), `game.html`, `simple-game.html` and
`direct-game.html`. Every rebuild, every test and every audit went to
`index.html`. The other three were left as-is, still running the original
physics, and nothing linked to the broken ones from the nav so the audit never
saw them.

`game.html` was the worst of them. Its update loop:

```js
let dynamicGravity = baseGravity * (1 + lander.score / 1000);
const dynamicThrust = baseThrust * (1 - Math.min(lander.score / 10000, 0.5));
lander.vy += dynamicGravity;
lander.x += lander.vx;          // no delta-time
```

Gravity **doubles** as your score rises, thrust **halves**, there is no drag and
no terminal velocity, and the walls set `vx = 0` so you stick to them. It also
hid its restart button behind `#controlButtons { display: none }`, which is never
un-hidden, so there was no way out of a bad run except reloading the page.

That is the build that was open in the in-app browser, which is a fair reason to
call the physics horrendous: it was a different, broken game.

### What was done about it

**Consolidated to one lander.** `game.html` and `simple-game.html` are now
redirect stubs that forward to `index.html`. `direct-game.html` launches
`index.html` with the current parameter names (`ticker=`, `name=`) instead of the
retired ones. Old bookmarks, saved links and the direct-launch flow all keep
working, and there is no longer a second physics implementation to land on by
accident. The `SIMPLE VERSION` link was removed from the real game.

**Restart, properly this time.** A `RESTART` button sits in the instrument panel
and is visible during play, with `R` as a keyboard shortcut. This is the exact
gap that made the old build feel like a dead end.

**The reference rotation, ported rather than approximated.** The previous attempt
kept real angular momentum and only nudged toward a detent, which was still
slippery: you could overshoot and end up fighting the ship. The reference simply
does not have that problem, because:

```js
targetRotation += direction * 15      // rate limited to one step per 80 ms
targetRotation = clamp(targetRotation, -90, 90)
rotation += (targetRotation - rotation) * 0.3
if (|rotation - targetRotation| < 0.1) rotation = targetRotation
```

That is now implemented as written, with the per-frame `* 0.3` ease converted to
`1 - Math.pow(1 - 0.3, dt * 60)` so it behaves identically at 120 Hz. It is an
arcade control model rather than a simulation, so it lives behind the assist
flag: **easy and medium get it, hard keeps the raw momentum physics**, and the
`ASSIST` button toggles it live.

Measured: one tap of the rotation key moves exactly 15.00 degrees. Holding it
stops at exactly 90.000 and no further. Releasing holds the angle to the
floating-point bit (90.000000 before and after three seconds of coasting). Spin
is exactly 0.

### Verification

```
node .scratch/audit/lander-physics.js   # 36 passed
node .scratch/audit/lander-flow.js      #  9 passed
node .scratch/audit/audit.js            # 15/15 pages clean
```

`lander-flow.js` is new and covers the things that were actually broken:
`game.html` and `simple-game.html` reach the real game, the old
`stockSymbol=`/`playerName=` parameters are mapped to `ticker=`/`name=`, the
restart button is visible during play and resets the ship to the top, `R` does
the same, and the assist button flips the control model.

The two angular-momentum assertions moved to hard mode, since that physics is
now opt-in, and five assertions were added for the stepped model.

### Lesson for next time

Consolidate duplicates *before* rebuilding one of them. Four copies of the same
game means the audit, the tests and the user can all be looking at different
files, and "it is fixed" is then only true of one of them.
