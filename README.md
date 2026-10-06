# DegenLander Portal

A free browser arcade of crypto-themed games. No wallet, no signup, no backend.

**Live:** https://benpomme.github.io/DegenLanderPortal/

## The games

| Game | What it is |
|---|---|
| [Degen Lander](Games/degenlander/index.html) | Land a rocket on a live candle chart without crashing |
| [Rugpull Roulette](Games/RugpullRoulette/index.html) | Bet on which shitcoin gets rugged next, ten rounds |
| [Degenerate Slots](Games/DegenerateSlots/index.html) | A slot machine that has never once been kind |
| [Crypto Shitter](Games/CryptoShitter/index.html) | Dump your bags before the dev pulls liquidity |
| [Spaceship World](Games/SpaceshipWorld/home.html) | Five rounds across the solar system |
| [Ant Simulator](Games/AntsSimulator/index.html) | Command a colony and out-breed the smart ants |
| [Nerd Soccer](Games/NerdSoccer/PenFootballGameWithWallBounce.html) | Penalty shootout with wall bounces |
| [Neon Labyrinth](Games/laby/labirinthgame.html) | Escape the maze before the clock eats you |

### Degen Lander

The flagship is a small physics sim rather than a flavour-text minigame. The
terrain is a real stock chart, the ship has mass, angular momentum and a finite
amount of fuel, and a touchdown only counts when both legs are down, the hull is
clear, the descent rate and sideways slide are inside the envelope, and the ship
is lined up with the slope it is landing on.

Controls: `↑`/`W` thrust, `←` `→` rotate, `P` pause, `F` fullscreen. On touch,
the three pads under the canvas do the same thing.

A run is a ladder. Land on the beacon, then bank the score or double down onto a
harder site with a smaller pad, stronger wind and tighter limits. Precision is
the biggest scoring term, so the game rewards the skill it is about.

The simulation runs at a fixed 120 Hz with an accumulator and is interpolated for
rendering, so it behaves identically on a 30 Hz laptop and a 240 Hz monitor. The
engine lives in `Games/degenlander/lander.js` and exposes `window.advanceTime(ms)`
and `window.render_game_to_text()` for automated testing.

`?seed=` `?diff=` and `?ticker=` are accepted, so a link can reproduce an exact
landing site, for example:

```
Games/degenlander/index.html?seed=20261006&diff=hard&ticker=TSLA
```

## Running it locally

The site is plain static HTML, CSS and JavaScript. There is no build step.

```bash
python3 -m http.server 8811
# then open http://127.0.0.1:8811/
```

Any static file server works. Opening the HTML files directly with `file://`
mostly works, but a server is recommended so relative paths and `fetch` behave
the same as in production.

## How it is put together

```
index.html              the arcade
leaderboard.html        global scores
css/degen.css           the whole design system (colours, nav, cards, CRT)
js/degen-theme.js       portal core: base path, nav injection, CRT, toasts
js/arcade.js            arcade page: ticker, stats, animated game cards
js/sound-effects.js     Web Audio synthesizer, generates every sound effect
js/leaderboard.js       the score store
js/game-bridge.js       adapter the games call when a run ends
Games/degenlander/lander.js   the Degen Lander physics engine
assets/fonts/           self-hosted Press Start 2P (latin subset)
Games/<name>/           one self-contained folder per game
docs/VIRAL-IDEAS.md     10 concrete growth ideas, ranked
```

### Adding a game

1. Drop the folder under `Games/`.
2. Include the portal scripts, using relative paths so project-page hosting works:

```html
<link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<script src="../../js/degen-theme.js"></script>
<script src="../../js/sound-effects.js"></script>
<script src="../../js/leaderboard.js"></script>
<script src="../../js/game-bridge.js"></script>
```

3. Add an entry to the `GAMES` array in `js/degen-theme.js`. The nav, the arcade
   grid and the leaderboard tabs all read from that one list.
4. When a run ends, call:

```js
DegenGame.finish('your-game-id', playerName, score);
```

### Conventions that matter

- **Every internal path must be relative.** The site is published as a GitHub
  Pages *project* page, so it lives under `/DegenLanderPortal/`, not at a domain
  root. Root-absolute paths like `/js/foo.js` silently 404.
- **Always include a viewport meta tag.** Without it, mobile Chrome falls back to
  a 980px layout viewport and the page renders as an unreadable thumbnail.
- **No new third-party CDNs.** Earlier versions loaded Tailwind, TensorFlow.js and
  placeholder images from CDNs that either vanished or were blocked. Everything
  needed is vendored or generated.

## Scores and privacy

Scores are stored in the browser's `localStorage`. Nothing is uploaded anywhere,
there are no cookies and there is no analytics. The seeded rows on the
leaderboard are labelled `HOUSE` on purpose: they exist so a fresh browser does
not see an empty table, and they are not presented as real players.

The old Firebase Realtime Database (`degenlander.firebaseio.com`) no longer
exists, so the previous cross-device leaderboard cannot work. `js/leaderboard.js`
isolates all storage behind one small API, so swapping in a real backend later
means editing that one file. See `docs/VIRAL-IDEAS.md` for the options.

## Deployment

GitHub Pages, free tier, deployed by `.github/workflows/deploy.yml` on every push
to `main`. There is no custom domain: an earlier `CNAME` pointed at
`degenlander.com`, whose DNS stopped resolving, which made GitHub Pages redirect
the entire site to a dead domain. If a custom domain is wanted again, add it in
the repository's Pages settings and re-add the `CNAME` file, after the domain's
DNS actually resolves.

## License

All rights reserved.
