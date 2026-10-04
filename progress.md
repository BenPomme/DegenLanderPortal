# DegenLander Portal — Revival

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
- STUCK: rugpull (syntax error), slots (needs correct start button — re-verify)

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

## Status
- [x] Full browser audit of 15 pages
- [ ] Shared design system
- [ ] Game bug fixes
- [ ] Visual overhaul
- [ ] Publish
- [ ] 10 viral ideas
