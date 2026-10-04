# DegenLander: 10 ideas to make it spread

Written after the 2026-10 revival. Everything here is buildable on the free
GitHub Pages setup that is already live, with no server and no running costs,
unless the idea says otherwise.

Ranked by (impact x how cheap it is). Start at number 1.

---

## 1. Score cards people actually want to post

**The idea.** When a run ends, render a 1200x630 PNG on a canvas: your score, your
rank, the game, your degen name, the date, and a QR code pointing back at the
site. Offer "Copy image" and "Download". The image is the ad.

**Why it spreads.** Right now a player has nothing to show anyone. A score on a
leaderboard nobody visits is worth nothing, but a picture is trivially postable
to X, Telegram, WhatsApp and Discord, and it carries the URL with it. This is the
single highest-leverage change on the list, and every game already has the
numbers needed to draw it.

**Build.** One shared `js/share-card.js` using `canvas.toBlob()` plus
`navigator.clipboard.write()`. Add a `Share` button next to every existing score
submit. Roughly a day. QR can be generated with a small vendored encoder so
there is no third-party request.

**Effort:** low. **Impact:** very high.

---

## 2. One seed per day, shared by everyone

**The idea.** All randomness in every game derives from a single daily seed
(`YYYY-MM-DD`). Everyone playing Degenlander today lands on the same candle
chart. Everyone spinning the slots today gets the same reel sequence.

**Why it spreads.** It converts eight single-player toys into a shared daily
event. That is what makes Wordle a habit: the same puzzle for everybody, one
score worth comparing, and a reason to come back tomorrow. It also makes the
leaderboards meaningful, because comparing scores on different random charts is
currently apples to oranges.

**Build.** Replace `Math.random()` with a seeded PRNG (mulberry32) keyed on the
date plus the game id, and expose the seed in the URL. A daily streak counter in
`localStorage` gives the return loop.

**Effort:** medium. **Impact:** very high.

---

## 3. Challenge links: "beat my score"

**The idea.** After a run, generate a link like
`/Games/degenlander/?challenge=8842&by=BigDegen&score=9410`. Opening it shows a
head-to-head banner: "BigDegen scored 9,410 on this chart. Beat it." When the run
ends, the result is shown as a win or a loss against the challenger.

**Why it spreads.** A challenge is a direct, personal, low-friction social ask,
which out-performs a generic "come play my game" every time. It works in a group
chat with no account and no install.

**Build.** Parse the query string on load (the Degenlander already reads URL
params), draw a banner, and record the head-to-head outcome locally. Pairs
perfectly with idea 1: the share card can embed the challenge link.

**Effort:** low. **Impact:** high.

---

## 4. Ghost runs

**The idea.** Store the input timeline of a good run (a compact list of frame
and key events). On replay, draw a translucent ghost of that run racing you. Ship
a default ghost per game so it works with zero setup, and let a challenged player
load the challenger's ghost from the challenge link.

**Why it spreads.** It makes a solo game feel occupied, and it turns every
challenge link into a genuine race rather than a number on a page. "I beat your
ghost" is a much better sentence than "I beat your score."

**Build.** Record `[frame, keydown|keyup]` into an array, serialise as JSON, and
put it in the challenge URL (base64, compressed) or in `localStorage` for the
default ghost. Each game needs its input loop wired to a recorder, which is a few
lines per game because they all read from a small set of keys.

**Effort:** medium. **Impact:** high.

---

## 5. Name your own shitcoin before you play

**The idea.** A one-field prompt before a run: name the token you are about to
ape into. `$GOBLIN`, `$MUMSPAGHETTI`, whatever. The ticker then appears in the
game's HUD, on the leaderboard row and on the share card.

**Why it spreads.** Personalisation is the cheapest way to make an output feel
like yours, and a silly ticker is inherently screenshot-worthy. It also gives
every share card a unique, funny detail that a plain score does not have.

**Build.** One input, one `localStorage` key, and a ticker label threaded through
the HUD and the share card. Most games already take a player name, so the plumbing
exists.

**Effort:** low. **Impact:** medium-high.

---

## 6. The Wall of Shame (a leaderboard for losing)

**The idea.** A second board that ranks the *worst* runs: biggest drawdown,
longest losing streak, fastest rage-quit, most times rugged. Each entry gets a
deadpan one-line caption.

**Why it spreads.** Losing is funnier than winning, and "I am officially rank 1 at
being terrible" is far more postable than "I am rank 47." It also gives players
who will never reach the top of the main board a reason to keep playing and
sharing.

**Build.** The score store already keeps every run. Add a second sort and a
caption generator. Half a day.

**Effort:** low. **Impact:** medium-high.

---

## 7. Meta-jokes as buttons: Connect Wallet, Claim Airdrop

**The idea.** A prominent "Connect Wallet" button that opens a fake wallet
connector, spins for two seconds, and then reports `RUGGED`. A "Claim Airdrop"
button that awards precisely zero tokens and logs "airdrop claimed: nothing" on
the Wall of Shame.

**Why it spreads.** The entire audience has been rugged, and shared pain is the
most reliable social currency in crypto. These are self-contained screenshot
moments, and they cost almost nothing to build because the payoff is text.

**Build.** Two buttons, two modal flows, one entry on the shame board. Keep the
joke obviously a joke: no real wallet API, no real token, and a visible
disclaimer.

**Effort:** low. **Impact:** medium.

---

## 8. Embeddable cabinet widget

**The idea.** One-line embed for any game, with an optional per-site leaderboard:

```html
<iframe src="https://benpomme.github.io/DegenLanderPortal/embed/slots.html?ref=yoursite"
        width="480" height="640" loading="lazy"></iframe>
```

**Why it spreads.** Every embed is a permanent backlink and a permanent
distribution surface, and crypto blogs, Discords and Substacks are constantly
short of things to put in a post. A `?ref=` parameter also shows which sites
actually drive traffic, which is the only analytics that matters here.

**Build.** A stripped-chrome wrapper page per game plus a copy-paste snippet box
on each game page. The games are already self-contained HTML, so this is mostly
layout, though the `ref` attribution needs somewhere to live (start with
`localStorage`, or a free hosted counter later).

**Effort:** medium. **Impact:** medium-high, compounding.

---

## 9. Procedural chiptune soundtrack

**The idea.** The portal already has a synthesizer and no audio files. Add a
generated four-channel chiptune loop per game, with a track selector, and let
players export a run's soundtrack as a short WAV.

**Why it spreads.** It makes the arcade feel like a product rather than a
collection of demos, and "I made this beat by losing at slots" is a genuinely
novel shareable artefact. It also costs zero bytes of assets.

**Build.** A small step sequencer on top of the existing `DegenSound` engine: a
note table, a scheduler on the AudioContext clock, and per-game tempo and key.
Keep it behind the existing sound toggle.

**Effort:** medium. **Impact:** medium.

---

## 10. Streaks, rivals and a seasonal wipe

**The idea.** Three small systems that compound:

- a daily streak counter with a visible flame
- a named "rival": the player directly above you on your best board, with a
  one-click challenge link (idea 3) and a ghost (idea 4)
- a 30-day season that ends with every board wiped and a "season champion"
  certificate image generated for the winners

**Why it spreads.** Streaks drive the daily return, rivals drive the rivalry, and
the wipe creates a recurring event that everyone can win because the old scores
do not accumulate forever. The certificate gives the winner something to post.

**Build.** All `localStorage` plus the share-card renderer from idea 1. The season
can be derived from the date, so no scheduling infrastructure is needed.

**Effort:** medium. **Impact:** medium-high.

---

## What I would do first

1. **Score cards** (idea 1). Nothing spreads until there is something to post.
2. **Daily seed** (idea 2). Turns eight toys into one daily habit.
3. **Challenge links** (idea 3). Cheapest possible conversion of a visitor into a
   sender, and it stacks with the two above.

Those three together are roughly two to three days of work and they are the whole
growth engine. Ideas 4 to 10 are then multiplication on top of a loop that already
works.

## One thing to fix before any of it

The leaderboard is currently per-browser (`localStorage`), so a score posted on
your phone never appears on mine. That is fine for bragging rights, but a shared
board is what makes ideas 2, 3, 6 and 10 land. When a real backend is wanted, the
cheapest free options are a Cloudflare Worker with Durable Objects or a free
Supabase project; the store is already isolated behind `DegenScores` in
`js/leaderboard.js`, so only that one file needs to change.
