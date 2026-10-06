/* ===========================================================================
   DEGENLANDER PORTAL: core module
   Loaded by every page. Works out where the portal root is, injects the shared
   stylesheet when a page has not linked it directly, builds the navigation bar,
   adds the CRT overlay, and exposes small helpers (toast, sparkles, base path).

   IMPORTANT, hosting: this site is published as a GitHub Pages *project* page,
   i.e. https://<user>.github.io/DegenLanderPortal/. Every internal path must
   therefore be relative. This module derives the root from its own <script src>
   so the same code works at a domain root, on github.io, or from file://.
   =========================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------ base path ---
  var SELF = document.currentScript ||
    (function () {
      var s = document.getElementsByTagName('script');
      return s[s.length - 1];
    })();

  /** Absolute URL of the portal root, with a trailing slash. */
  function computeRoot() {
    try {
      var url = new URL(SELF.src, window.location.href);
      // .../js/degen-theme.js  ->  portal root
      return url.href.replace(/js\/degen-theme\.js.*$/, '');
    } catch (e) {
      return './';
    }
  }

  var ROOT = computeRoot();

  function base(relPath) {
    return ROOT + String(relPath || '').replace(/^\.?\//, '');
  }

  // ------------------------------------------------------------- registry ---
  var GAMES = [
    { id: 'degenlander', path: 'Games/degenlander/index.html', name: 'DEGEN LANDER',
      short: 'LANDER',
      goal: 'Bank a score, then decide whether to double down',
      skill: 'Rocket control',
      blurb: 'Land your rocket on a live candle chart. Crash and you lose it all.',
      badge: 'FLAGSHIP', badgeClass: 'd-badge--gold', players: '9.4K' },
    { id: 'rugpull', path: 'Games/RugpullRoulette/index.html', name: 'RUGPULL ROULETTE',
      short: 'RUGPULL',
      goal: 'Reach $2,700 in 10 rounds',
      skill: 'Reading dossiers',
      blurb: 'Bet on which shitcoin gets rugged next. Ten rounds. No mercy.',
      badge: 'HOT', badgeClass: 'd-badge--red', players: '6.1K' },
    { id: 'slots', path: 'Games/DegenerateSlots/index.html', name: 'DEGENERATE SLOTS',
      short: 'SLOTS',
      goal: 'Turn $1,000 into $2,000 in 22 spins',
      skill: 'Reel timing',
      blurb: 'The most addictive slot machine in the entire cryptoverse.',
      badge: 'DEGEN', badgeClass: 'd-badge--purple', players: '5.7K' },
    { id: 'cryptoshitter', path: 'Games/CryptoShitter/index.html', name: 'CRYPTO SHITTER',
      short: 'SHITTER',
      goal: 'Turn $10,000 into $50,000 in 120 seconds',
      skill: 'Chart timing',
      blurb: 'Dump your bags before the dev pulls the liquidity. Timing is everything.',
      badge: 'NEW', badgeClass: '', players: '4.2K' },
    { id: 'spaceship', path: 'Games/SpaceshipWorld/home.html', name: 'SPACESHIP WORLD',
      short: 'SPACESHIP',
      goal: 'Land on all 5 exoplanets with 3 hulls',
      skill: 'Fuel management',
      blurb: 'Five rounds across the solar system. Fuel is scarce, asteroids are not.',
      badge: '5 ROUNDS', badgeClass: 'd-badge--cyan', players: '3.8K' },
    { id: 'ants', path: 'Games/AntsSimulator/index.html', name: 'ANT SIMULATOR',
      short: 'ANTS',
      goal: 'Survive 5 waves of smarties',
      skill: 'Resource management',
      blurb: 'Command a colony, evolve smarter ants, out-breed the competition.',
      badge: 'SIM', badgeClass: 'd-badge--out', players: '2.9K' },
    { id: 'nerdsoccer', path: 'Games/NerdSoccer/PenFootballGameWithWallBounce.html', name: 'NERD SOCCER',
      short: 'SOCCER',
      goal: 'First to five against a keeper that learns you',
      skill: 'Reading the keeper',
      blurb: 'Penalty shootout with wall bounces. Physics hates you.',
      badge: '1v1', badgeClass: 'd-badge--out', players: '2.1K' },
    { id: 'laby', path: 'Games/laby/labirinthgame.html', name: 'NEON LABYRINTH',
      short: 'LABYRINTH',
      goal: 'Escape 5 mazes with one life',
      skill: 'Navigation under pressure',
      blurb: 'Escape the neon maze before the clock eats you alive.',
      badge: 'REFLEX', badgeClass: 'd-badge--cyan', players: '1.6K' }
  ];

  function gameById(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return null;
  }

  // ------------------------------------------------------------ DOM utils ---
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      });
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function ensureStylesheet() {
    var href = base('css/degen.css');
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].href && links[i].href.indexOf('css/degen.css') !== -1) return;
    }
    // Inserted FIRST in <head> on purpose: the games carry their own page styles
    // and those must win over the shared sheet where the two overlap.
    document.head.insertBefore(el('link', { rel: 'stylesheet', href: href }), document.head.firstChild);
  }

  /** Work out which game page we are on, so the nav can highlight it. */
  function currentGameId() {
    var here = window.location.pathname;
    for (var i = 0; i < GAMES.length; i++) {
      if (here.indexOf('/Games/' + GAMES[i].id) !== -1) return GAMES[i].id;
    }
    return null;
  }

  // ----------------------------------------------------------------- nav ---
  function buildNav() {
    var here = window.location.pathname;
    var active = currentGameId();
    var onLeaderboard = /leaderboard\.html$/.test(here);

    var logo = el('a', { class: 'd-nav__logo', href: base('index.html') },
      [el('span', { text: 'DEGEN' }), el('b', { text: 'LANDER' }), el('span', { text: 'PORTAL' })]);

    var links = el('div', { class: 'd-nav__links' });

    function navLink(href, label, isActive, title) {
      var a = el('a', { class: 'd-nav__link' + (isActive ? ' is-active' : ''), href: href, text: label });
      if (title) a.setAttribute('title', title);
      links.appendChild(a);
      return a;
    }

    var onHome = /(^|\/)index\.html$/.test(here) && here.indexOf('/Games/') === -1;
    navLink(base('index.html'), 'ARCADE', onHome || (!active && !onLeaderboard), 'Back to the arcade');
    navLink(base('leaderboard.html'), 'LEADERBOARD', onLeaderboard, 'Global degen rankings');

    // Show every game, but lead with the one currently open.
    var ordered = GAMES.slice().sort(function (a, b) {
      if (a.id === active) return -1;
      if (b.id === active) return 1;
      return 0;
    });
    ordered.forEach(function (g) {
      navLink(base(g.path), g.short || g.name, active === g.id, g.name + ': ' + g.blurb);
    });

    var right = el('div', { class: 'd-nav__right' });

    var soundBtn = el('button', { class: 'd-nav__icon', id: 'd-sound-toggle', title: 'Toggle sound', 'aria-label': 'Toggle sound' });
    soundBtn.textContent = isMuted() ? '🔇' : '🔊';
    soundBtn.addEventListener('click', function () {
      var nowMuted = !isMuted();
      localStorage.setItem('degen_muted', nowMuted ? '1' : '0');
      soundBtn.textContent = nowMuted ? '🔇' : '🔊';
      if (window.DegenSound) {
        if (nowMuted) { if (DegenSound.mute) DegenSound.mute(); }
        else {
          if (DegenSound.unmute) DegenSound.unmute();
          if (DegenSound.play) DegenSound.play('ui_click');
        }
      }
      toast(nowMuted ? 'Sound off. Coward.' : 'Sound on. Let\'s go.');
    });

    var crtBtn = el('button', { class: 'd-nav__icon', id: 'd-crt-toggle', title: 'Toggle CRT effect', 'aria-label': 'Toggle CRT effect' });
    crtBtn.textContent = '📺';
    crtBtn.addEventListener('click', function () {
      var off = document.body.classList.toggle('d-nocrt');
      localStorage.setItem('degen_nocrt', off ? '1' : '0');
      toast(off ? 'CRT off.' : 'CRT on. Feed me pixels.');
    });

    right.appendChild(soundBtn);
    right.appendChild(crtBtn);

    var nav = el('nav', { class: 'd-nav', id: 'd-nav', role: 'navigation', 'aria-label': 'Portal' });
    nav.appendChild(logo);
    nav.appendChild(links);
    nav.appendChild(right);
    return nav;
  }

  function mountNav() {
    if (document.getElementById('d-nav')) return;
    var nav = buildNav();
    var legacy = document.querySelector('.nav-bar');
    if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.classList.add('d-has-nav');
    syncNavHeight();
    window.addEventListener('resize', syncNavHeight);
    if (window.ResizeObserver) new ResizeObserver(syncNavHeight).observe(nav);
  }

  /**
   * The nav is position:fixed so that it never becomes a flex item inside the
   * games' own `display:flex` body layouts. body.d-has-nav then reserves exactly
   * the height the nav actually occupies, which changes when the links wrap.
   */
  function syncNavHeight() {
    var nav = document.getElementById('d-nav');
    if (!nav) return;
    var h = Math.ceil(nav.getBoundingClientRect().height);
    // Clamp so a layout glitch can never reserve an absurd amount of space, and
    // never let the reserved value exceed a third of the viewport.
    var max = Math.round(window.innerHeight / 3);
    if (h > 0) h = Math.min(h, max);
    if (h > 0) document.documentElement.style.setProperty('--d-nav-h', h + 'px');
  }

  // ------------------------------------------------------------- overlays ---
  function mountOverlays() {
    if (!document.querySelector('.d-vignette')) document.body.appendChild(el('div', { class: 'd-vignette' }));
    if (!document.querySelector('.d-crt')) document.body.appendChild(el('div', { class: 'd-crt' }));
    if (!document.getElementById('d-toasts')) document.body.appendChild(el('div', { class: 'd-toasts', id: 'd-toasts' }));
  }

  // ------------------------------------------------------------- settings ---
  function isMuted() { return localStorage.getItem('degen_muted') === '1'; }

  // --------------------------------------------------------------- toasts ---
  function toast(msg, kind, ms) {
    if (!document.body) return null;
    var host = document.getElementById('d-toasts');
    if (!host) { host = el('div', { class: 'd-toasts', id: 'd-toasts' }); document.body.appendChild(host); }
    var t = el('div', { class: 'd-toast' + (kind ? ' d-toast--' + kind : ''), text: msg });
    host.appendChild(t);
    setTimeout(function () {
      t.classList.add('d-toast--out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }, ms || 3200);
    return t;
  }

  // ------------------------------------------------------------- sparkles ---
  function sparkle(x, y) {
    if (!document.body) return;
    var colors = ['#00ff9d', '#ffd166', '#b026ff', '#00e5ff'];
    for (var i = 0; i < 7; i++) {
      var s = el('div', { class: 'd-spark' });
      var a = (Math.PI * 2 * i) / 7 + Math.random() * 0.6;
      var r = 14 + Math.random() * 18;
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.background = colors[i % colors.length];
      s.style.boxShadow = '0 0 10px ' + colors[i % colors.length];
      s.style.setProperty('--dx', (Math.cos(a) * r).toFixed(1) + 'px');
      s.style.setProperty('--dy', (Math.sin(a) * r).toFixed(1) + 'px');
      document.body.appendChild(s);
      (function (node) { setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 640); })(s);
    }
  }

  function bindSparkles() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    window.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      sparkle(e.clientX, e.clientY);
    }, { passive: true });
  }

  // ----------------------------------------------------------- easter egg ---
  var KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  function bindKonami() {
    var idx = 0;
    window.addEventListener('keydown', function (e) {
      var want = KONAMI[idx];
      var got = e.key;
      if (got && got.length === 1) got = got.toLowerCase();
      if (got === want || got === want.toLowerCase()) {
        idx++;
        if (idx === KONAMI.length) {
          idx = 0;
          document.body.classList.toggle('d-nocrt');
          toast('DEGEN MODE ENGAGED. Nothing happened, but you feel richer.', 'gold', 5200);
          if (window.DegenSound && DegenSound.play) DegenSound.play('ui_success');
        }
      } else {
        idx = (got === KONAMI[0]) ? 1 : 0;
      }
    });
  }

  // ----------------------------------------------------------- theme shim ---
  // The original portal exposed a light/dark toggle. These are kept so that older
  // call sites keep working, but the portal is now permanently dark.
  function applyTheme() {
    // Game pages keep their own body styling (several of them use
    // `body { display:flex; height:100vh }` as their whole layout) and only adopt
    // the portal chrome. The arcade / leaderboard get the full d-body skin.
    if (currentGameId()) {
      document.body.classList.remove('d-body');
      document.body.classList.add('d-game-page');
    } else {
      document.body.classList.remove('d-game-page');
      document.body.classList.add('d-body');
    }
    document.body.classList.remove('light-mode');
  }

  // ------------------------------------------------------------------ api ---
  var DegenTheme = {
    version: '2.0.0',
    root: ROOT,
    base: base,
    games: GAMES,
    gameById: gameById,
    toast: toast,
    sparkle: sparkle,
    applyTheme: applyTheme,
    toggleTheme: function () { toast('Light mode is for people who sell the bottom.'); },
    init: function () {
      ensureStylesheet();
      applyTheme();
      if (localStorage.getItem('degen_nocrt') === '1') document.body.classList.add('d-nocrt');
      mountNav();
      mountOverlays();
      bindSparkles();
      bindKonami();
      document.dispatchEvent(new CustomEvent('degen:ready', { detail: DegenTheme }));
    },
  };

  window.DegenTheme = DegenTheme;
  window.applyTheme = applyTheme;         // legacy bare-function call sites
  window.toggleTheme = DegenTheme.toggleTheme;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { DegenTheme.init(); });
  } else {
    DegenTheme.init();
  }
})();
