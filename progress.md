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
