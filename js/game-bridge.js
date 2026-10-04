/* ===========================================================================
   DEGENLANDER PORTAL: game bridge

   Each game grew its own localStorage leaderboard under a different key, so none
   of them fed the portal-wide board on leaderboard.html. This file is a thin
   adapter the games call when a run ends:

     DegenGame.finish('slots', name, score)   -> { rank, total }

   It forwards to js/leaderboard.js (localStorage + labelled HOUSE seed rows) and
   shows a toast with the player's rank. Safe to call when DegenScores is absent:
   it then does nothing rather than throwing inside a game loop.
   =========================================================================== */
(function () {
  'use strict';

  var DegenGame = {
    /** A name to attach to a score: whatever the player used last, else a default. */
    name: function (fallback) {
      try {
        var stored = localStorage.getItem('degen_name');
        if (stored) return stored;
      } catch (e) { /* private mode */ }
      return fallback || 'Anon Degen';
    },

    /** Remember the player's chosen name for future runs. */
    rememberName: function (n) {
      if (!n) return;
      try { localStorage.setItem('degen_name', String(n).slice(0, 14)); } catch (e) { /* noop */ }
    },

    /** Record a finished run against the portal-wide board. */
    finish: function (gameId, name, score) {
      var s = window.DegenScores;
      if (!s || !gameId) return null;

      var numeric = Number(score);
      if (!isFinite(numeric) || numeric <= 0) return null;

      var who = name || DegenGame.name();
      DegenGame.rememberName(who);

      var result;
      try {
        result = s.submit({ game: gameId, name: who, score: numeric });
      } catch (e) {
        return null;
      }

      if (window.DegenTheme && DegenTheme.toast && result && result.rank) {
        DegenTheme.toast(
          'Score posted: ' + numeric.toLocaleString('en-US') +
          ', you are #' + result.rank + ' of ' + result.total + '.',
          result.rank === 1 ? 'gold' : null,
          4200
        );
      }
      if (window.DegenSound && DegenSound.play) DegenSound.play('game', 'levelUp');
      return result;
    },

    /** Rank the player would get for this score, without recording it. */
    preview: function (gameId, score) {
      var s = window.DegenScores;
      if (!s) return null;
      var rows = s.rows(gameId);
      var n = Number(score) || 0;
      var rank = 1;
      for (var i = 0; i < rows.length; i++) if (rows[i].score >= n) rank++;
      return { rank: rank, total: rows.length + 1 };
    },
  };

  window.DegenGame = DegenGame;
})();
