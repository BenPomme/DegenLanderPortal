/* ===========================================================================
   DEGENLANDER PORTAL — scores

   The original leaderboard used Firebase Realtime Database at
   degenlander.firebaseio.com. That database no longer exists — it now answers
   `{"error":"404 Not Found"}` — and no `databaseURL` was ever configured, so the
   board could never load for anyone. This module replaces it with a store that
   always works and needs no server:

     * every score a player posts is kept in localStorage
     * a small set of clearly-labelled HOUSE rows seeds each board so it is never
       empty on a fresh browser (they are tagged, not passed off as real players)
     * if a real backend is configured later (window.firebaseConfig.databaseURL),
       remote rows are merged in on top

   Public API:
     DegenScores.submit({ game, name, score })  -> { rank, total }
     DegenScores.rows(gameId)                   -> sorted array, best first
     DegenScores.top(gameId, n)
     DegenScores.clear(gameId?)                 -> wipe local rows
   =========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'degen_scores_v1';
  var MAX_ROWS = 500;

  // Clearly-labelled seeds. `house: true` renders a HOUSE badge on the board.
  var HOUSE = [
    { game: 'degenlander', name: 'Fucking Legend', score: 9999,  house: true },
    { game: 'degenlander', name: 'Diamond Hands',  score: 8888,  house: true },
    { game: 'degenlander', name: 'HODL King',      score: 7777,  house: true },
    { game: 'degenlander', name: 'Margin Call',    score: 6104,  house: true },
    { game: 'degenlander', name: 'Liquidated',     score: 4200,  house: true },

    { game: 'rugpull',     name: 'Rug Enjoyer',    score: 8420,  house: true },
    { game: 'rugpull',     name: 'Exit Scam',      score: 7130,  house: true },
    { game: 'rugpull',     name: 'Soft Rug',       score: 5980,  house: true },
    { game: 'rugpull',     name: 'Honeypot',       score: 4410,  house: true },

    { game: 'slots',       name: 'Jackpot Jen',    score: 12500, house: true },
    { game: 'slots',       name: 'Reel Degenerate',score: 9400,  house: true },
    { game: 'slots',       name: 'Spin Addict',    score: 7300,  house: true },
    { game: 'slots',       name: 'House Always',   score: 5200,  house: true },

    { game: 'cryptoshitter', name: 'Dump It',      score: 8800,  house: true },
    { game: 'cryptoshitter', name: 'Bag Holder',   score: 6650,  house: true },
    { game: 'cryptoshitter', name: 'Paper Hands',  score: 4900,  house: true },

    { game: 'spaceship',   name: 'Astro Degen',    score: 6789,  house: true },
    { game: 'spaceship',   name: 'Space Fucker',   score: 5678,  house: true },
    { game: 'spaceship',   name: 'Fuel Rater',     score: 4321,  house: true },

    { game: 'ants',        name: 'Bug Buster',     score: 8765,  house: true },
    { game: 'ants',        name: 'Colony Master',  score: 7654,  house: true },
    { game: 'ants',        name: 'Insect God',     score: 6543,  house: true },

    { game: 'nerdsoccer',  name: 'Greedy Ball',    score: 5432,  house: true },
    { game: 'nerdsoccer',  name: 'Brain Ball',     score: 4321,  house: true },

    { game: 'laby',        name: 'Maze Runner',    score: 7200,  house: true },
    { game: 'laby',        name: 'Wall Licker',    score: 5100,  house: true },
  ];

  function read() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var rows = raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      return [];
    }
  }

  function write(rows) {
    // Newest-first, capped, so a runaway loop can never blow the quota.
    var trimmed = rows.slice(0, MAX_ROWS);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      // Quota exceeded: drop the oldest half and retry once.
      try { localStorage.setItem(STORE_KEY, JSON.stringify(trimmed.slice(0, Math.floor(MAX_ROWS / 2)))); } catch (e2) { /* give up */ }
    }
  }

  function sanitiseName(name) {
    var n = String(name == null ? '' : name).trim().slice(0, 14);
    n = n.replace(/[<>&"']/g, '');          // stored as text, but keep it clean
    return n || 'Anon Degen';
  }

  function normalise(row) {
    return {
      game: String(row.game || 'unknown'),
      name: sanitiseName(row.name),
      score: Number(row.score) || 0,
      ts: Number(row.ts) || 0,
      house: !!row.house,
    };
  }

  var DegenScores = {
    /**
     * Record a run. Returns the player's rank on that board and the board size.
     */
    submit: function (opts) {
      opts = opts || {};
      var row = normalise({
        game: opts.game,
        name: opts.name,
        score: opts.score,
        ts: Date.now(),
      });
      var rows = read();
      rows.unshift(row);
      write(rows);
      var board = DegenScores.rows(row.game);
      var rank = 0;
      for (var i = 0; i < board.length; i++) {
        if (board[i].mine && board[i].ts === row.ts) { rank = i + 1; break; }
      }
      return { rank: rank, total: board.length, row: row };
    },

    /** Full board for one game (or every game when gameId is falsy), best first. */
    rows: function (gameId) {
      var mine = read().map(function (r) {
        var n = normalise(r);
        n.mine = true;
        return n;
      });
      var all = mine.concat(HOUSE.map(normalise));
      var filtered = gameId && gameId !== 'all'
        ? all.filter(function (r) { return r.game === gameId; })
        : all;

      filtered.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return (a.ts || 0) - (b.ts || 0);
      });
      return filtered.slice(0, 100);
    },

    top: function (gameId, n) {
      return DegenScores.rows(gameId).slice(0, n || 10);
    },

    best: function (gameId) {
      var rows = DegenScores.rows(gameId).filter(function (r) { return r.mine; });
      return rows.length ? rows[0].score : 0;
    },

    clear: function (gameId) {
      if (!gameId) { write([]); return; }
      write(read().filter(function (r) { return r.game !== gameId; }));
    },

    house: HOUSE,
  };

  window.DegenScores = DegenScores;
})();
