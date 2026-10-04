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
- `Games/degenlander/` contains four overlapping variants (index, game, simple-game,
  direct-game, test-stocks). `index.html` is the one the arcade links to. The others
  are reachable but are not linked from the portal nav; they could be consolidated.
- `Games/laby/labirinthgame.html` is still in French (it was never linked before this
  revival). It is now in the nav as "NEON LABYRINTH" under an English title.
- The `.d-crt` scanline overlay is a `position:fixed` element with `mix-blend-mode`.
  It is cheap, but worth re-measuring on low-end Android if FPS ever matters.
