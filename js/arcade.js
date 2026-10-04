/* ===========================================================================
   DEGENLANDER PORTAL — arcade page
   Builds the price tape, the hero stat strip, the game grid (with an animated
   canvas preview per game) and the leaderboard teasers.
   Depends on js/degen-theme.js (window.DegenTheme) being loaded first.
   =========================================================================== */
(function () {
  'use strict';

  var T = window.DegenTheme;
  if (!T) return;

  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------- the tape ---
  var TICKS = [
    ['BTC', 68421.55, +2.41], ['ETH', 3418.9, +1.07], ['SOL', 188.42, +6.83],
    ['DOGE', 0.1621, -3.55], ['SHIB', 0.0000241, +12.4], ['PEPE', 0.0000118, -8.19],
    ['RUG', 0.0000001, -99.7], ['BRM', 12.4, +4.02], ['WIF', 2.91, -5.6],
    ['BONK', 0.0000312, +9.14], ['TIA', 9.87, -1.22], ['ARB', 1.04, +0.55],
    ['OP', 2.37, +3.31], ['AVAX', 41.2, -2.08], ['LINK', 17.66, +1.94],
    ['MATIC', 0.7124, -4.41], ['FTM', 0.8412, +7.77], ['ATOM', 8.9, -0.33],
  ];

  function fmt(v) {
    if (v < 0.001) return v.toFixed(9).replace(/0+$/, '');
    if (v < 1) return v.toFixed(4);
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function buildTicker() {
    var track = $('d-ticker-track');
    if (!track) return;

    // The CSS marquee translates -50%, so the list must be rendered twice.
    var html = '';
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < TICKS.length; i++) {
        var s = TICKS[i][0], p = TICKS[i][1], c = TICKS[i][2];
        var up = c >= 0;
        html += '<span class="d-tick">' +
          '<span class="d-tick__sym">' + s + '</span>' +
          '<span class="d-tick__px">' + fmt(p) + '</span>' +
          '<span class="' + (up ? 'd-tick__up' : 'd-tick__down') + '">' +
          (up ? '&#9650;' : '&#9660;') + ' ' + (up ? '+' : '') + c.toFixed(2) + '%</span>' +
          '</span>';
      }
    }
    track.innerHTML = html;
  }

  // -------------------------------------------------------------- stats ----
  function buildStats() {
    var host = $('heroStats');
    if (!host) return;
    var stats = [
      ['GAMES', '8'],
      ['DEGENS TODAY', '1,284'],
      ['AVG TIME TO RAGE-QUIT', '4m 12s'],
      ['WALLETS REQUIRED', '0'],
    ];
    host.innerHTML = stats.map(function (s) {
      return '<div class="d-stat"><span class="d-stat__k">' + s[0] + '</span>' +
        '<span class="d-stat__v">' + s[1] + '</span></div>';
    }).join('');
  }

  // ---------------------------------------------------------- card art -----
  // Each renderer draws one frame of an animated preview at (w, h) with time t
  // in seconds. Keep them cheap: they run on every visible card at once.
  var rand = (function (seed) {
    return function (i) {
      var x = Math.sin(seed + i * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
  })(1.7);

  var ART = {
    // Rocket descending onto a candle chart.
    degenlander: function (g, w, h, t) {
      g.fillStyle = '#02040a'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 40; i++) {
        var sx = rand(i) * w, sy = (rand(i + 50) * h + t * 6) % h;
        g.fillStyle = 'rgba(180,220,255,' + (0.12 + rand(i + 90) * 0.4) + ')';
        g.fillRect(sx, sy, 1.4, 1.4);
      }
      var base = h * 0.74;
      g.strokeStyle = '#00ff9d'; g.lineWidth = 1.4; g.beginPath();
      for (var x = 0; x <= w; x += 6) {
        var y = base - Math.sin((x / w) * 7 + t * 1.1) * 9 - rand(Math.floor(x / 6)) * 5;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = 'rgba(0,255,157,0.14)';
      g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
      // rocket
      var ry = h * 0.26 + Math.sin(t * 1.4) * 5;
      var rx = w * 0.55 + Math.sin(t * 0.5) * 12;
      g.save(); g.translate(rx, ry); g.rotate(0.35);
      g.fillStyle = '#e8f6ff';
      g.beginPath(); g.moveTo(0, -11); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
      g.fillStyle = '#ff2d55';
      g.beginPath(); g.moveTo(-5, 6); g.lineTo(5, 6); g.lineTo(0, 12); g.closePath(); g.fill();
      g.fillStyle = '#ffd166';
      g.beginPath(); g.moveTo(-3, 6); g.lineTo(3, 6); g.lineTo(0, 6 + 6 + Math.random() * 6); g.closePath(); g.fill();
      g.restore();
    },

    // Roulette wheel of shitcoins.
    rugpull: function (g, w, h, t) {
      g.fillStyle = '#06040a'; g.fillRect(0, 0, w, h);
      var cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.34;
      var cols = ['#ff2d55', '#00ff9d', '#ffd166', '#b026ff', '#00e5ff', '#ff6b00'];
      g.save(); g.translate(cx, cy); g.rotate(t * 0.9);
      for (var i = 0; i < 10; i++) {
        g.fillStyle = cols[i % cols.length];
        g.globalAlpha = 0.88;
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, r, (i / 10) * Math.PI * 2, ((i + 1) / 10) * Math.PI * 2);
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
      g.strokeStyle = '#05060a'; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#05060a';
      g.beginPath(); g.arc(0, 0, r * 0.3, 0, Math.PI * 2); g.fill();
      g.restore();
      g.fillStyle = '#ffd166';
      g.beginPath(); g.moveTo(cx, cy - r - 9); g.lineTo(cx - 6, cy - r - 1); g.lineTo(cx + 6, cy - r - 1); g.closePath(); g.fill();
    },

    // Three spinning reels.
    slots: function (g, w, h, t) {
      g.fillStyle = '#07040c'; g.fillRect(0, 0, w, h);
      var syms = ['7', '$', 'B', 'R', 'A', 'X'];
      var cols = ['#ff2d55', '#00ff9d', '#ffd166', '#b026ff', '#00e5ff', '#ff6b00'];
      var cw = w / 3, ch = h / 3;
      for (var c = 0; c < 3; c++) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(c * cw + 3, 4, cw - 6, h - 8);
        g.strokeStyle = '#1e2c3f'; g.lineWidth = 2;
        g.strokeRect(c * cw + 3, 4, cw - 6, h - 8);
        for (var r = 0; r < 3; r++) {
          var idx = Math.floor(t * 5 + c * 2 + r) % syms.length;
          g.fillStyle = cols[(idx + c) % cols.length];
          g.font = 'bold ' + Math.floor(h / 5) + 'px ui-monospace, monospace';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(syms[idx], c * cw + cw / 2, ch * (r + 0.5));
        }
      }
    },

    // Candles falling into the void.
    cryptoshitter: function (g, w, h, t) {
      g.fillStyle = '#04070a'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 22; i++) {
        var x = (rand(i) * w + t * 26) % w;
        var seed = Math.floor((t * 26 + rand(i) * w) / 26);
        var up = rand(seed + i) > 0.45;
        var bh = 12 + rand(seed + i + 3) * 26;
        var y = (rand(seed + i + 7) * h + t * 34) % h;
        g.strokeStyle = up ? '#00ff9d' : '#ff2d55';
        g.fillStyle = up ? '#00ff9d' : '#ff2d55';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y + bh + 4); g.stroke();
        g.fillRect(x - 4, y, 8, bh);
      }
      g.fillStyle = 'rgba(255,45,85,0.1)'; g.fillRect(0, 0, w, h);
    },

    // Parallax starfield with a rocket.
    spaceship: function (g, w, h, t) {
      g.fillStyle = '#02030c'; g.fillRect(0, 0, w, h);
      for (var layer = 0; layer < 3; layer++) {
        var speed = 12 + layer * 24;
        for (var i = 0; i < 26; i++) {
          var x = (rand(i + layer * 40) * w + t * speed) % w;
          var y = rand(i + layer * 40 + 11) * h;
          g.fillStyle = 'rgba(200,225,255,' + (0.18 + layer * 0.25) + ')';
          g.fillRect(x, y, 1 + layer * 0.6, 1 + layer * 0.6);
        }
      }
      var pg = g.createRadialGradient(w * 0.78, h * 0.32, 3, w * 0.78, h * 0.32, 30);
      pg.addColorStop(0, '#b026ff'); pg.addColorStop(0.6, 'rgba(176,38,255,0.35)'); pg.addColorStop(1, 'transparent');
      g.fillStyle = pg;
      g.beginPath(); g.arc(w * 0.78, h * 0.32, 30, 0, Math.PI * 2); g.fill();
      var rx = w * 0.36 + Math.sin(t * 0.9) * 14, ry = h * 0.5 + Math.cos(t * 1.3) * 9;
      g.save(); g.translate(rx, ry); g.rotate(-0.5);
      g.fillStyle = '#e8f6ff';
      g.beginPath(); g.moveTo(0, -12); g.lineTo(5, 7); g.lineTo(-5, 7); g.closePath(); g.fill();
      g.fillStyle = '#00e5ff';
      g.beginPath(); g.moveTo(-5, 7); g.lineTo(5, 7); g.lineTo(0, 14 + Math.random() * 5); g.closePath(); g.fill();
      g.restore();
    },

    // Ant colony swarm.
    ants: function (g, w, h, t) {
      g.fillStyle = '#050a05'; g.fillRect(0, 0, w, h);
      // pheromone trails
      g.strokeStyle = 'rgba(0,255,157,0.14)'; g.lineWidth = 7;
      for (var p = 0; p < 3; p++) {
        g.beginPath();
        for (var x = 0; x <= w; x += 8) {
          var y = h * (0.3 + p * 0.22) + Math.sin(x * 0.05 + t + p) * 9;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      var cols = ['#00ff7f', '#ff4ce0', '#ff2d55', '#3d6bff', '#ffa500', '#00e5ff'];
      for (var i = 0; i < 26; i++) {
        var lane = Math.floor(rand(i) * 3);
        var ax = (rand(i + 5) * w + t * (16 + rand(i + 9) * 26)) % w;
        var ay = h * (0.3 + lane * 0.22) + Math.sin(ax * 0.05 + t + lane) * 9;
        g.fillStyle = cols[i % cols.length];
        g.beginPath(); g.arc(ax, ay, 2.1, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(ax - 3, ay - 0.4, 6, 0.8);
      }
      g.fillStyle = '#00ff9d';
      g.beginPath(); g.arc(w * 0.5, h * 0.88, 5, 0, Math.PI * 2); g.fill();
    },

    // Penalty shootout.
    nerdsoccer: function (g, w, h, t) {
      g.fillStyle = '#03110a'; g.fillRect(0, 0, w, h);
      // pitch lines
      g.strokeStyle = 'rgba(0,255,157,0.35)'; g.lineWidth = 1.5;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.beginPath(); g.moveTo(w / 2, 8); g.lineTo(w / 2, h - 8); g.stroke();
      g.beginPath(); g.arc(w / 2, h / 2, 16, 0, Math.PI * 2); g.stroke();
      // goal on the right
      var gy = h * 0.25, gh = h * 0.5;
      g.strokeStyle = '#00ff9d'; g.lineWidth = 3;
      g.strokeRect(w - 22, gy, 14, gh);
      g.lineWidth = 1;
      for (var i = 1; i < 5; i++) {
        g.beginPath(); g.moveTo(w - 22, gy + (gh / 5) * i); g.lineTo(w - 8, gy + (gh / 5) * i); g.stroke();
      }
      // ball travelling to the goal, looping
      var prog = (t * 0.55) % 1;
      var bx = 18 + (w - 46) * prog;
      var by = h * 0.6 - Math.sin(prog * Math.PI) * h * 0.16 + prog * (gy + gh * 0.5 - h * 0.6);
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(bx, by, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#05060a';
      g.beginPath(); g.arc(bx, by, 2, 0, Math.PI * 2); g.fill();
    },

    // Neon labyrinth with a runner.
    laby: function (g, w, h, t) {
      g.fillStyle = '#08030d'; g.fillRect(0, 0, w, h);
      var cols = Math.max(8, Math.floor(w / 22));
      var rows = Math.max(5, Math.floor(h / 22));
      var cw = w / cols, chh = h / rows;
      g.lineWidth = 1;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (rand(r * 31 + c * 7) > 0.62) {
            var hue = 190 + ((r + c) % 3) * 55;
            g.strokeStyle = 'hsla(' + hue + ',100%,60%,0.55)';
            g.strokeRect(c * cw + 1.5, r * chh + 1.5, cw - 3, chh - 3);
          }
        }
      }
      // runner tracing a path
      var steps = 40;
      var k = (t * 5) % steps;
      for (var i = 0; i < 8; i++) {
        var s = (k - i + steps) % steps;
        var px = ((s % cols) + 0.5) * cw;
        var py = (Math.floor(s / cols) % rows + 0.5) * chh;
        g.fillStyle = 'hsla(' + (300 - i * 12) + ',100%,65%,' + (0.85 - i * 0.1) + ')';
        g.beginPath(); g.arc(px, py, 3.4 - i * 0.25, 0, Math.PI * 2); g.fill();
      }
    },
  };

  // --------------------------------------------------------- build cards ---
  function buildCards() {
    var grid = $('gameGrid');
    if (!grid) return [];

    var canvases = [];
    T.games.forEach(function (game) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'd-card';
      a.href = T.base(game.path);
      a.setAttribute('aria-label', game.name + ' — ' + game.blurb);

      var art = document.createElement('div');
      art.className = 'd-card__art';
      var canvas = document.createElement('canvas');
      canvas.width = 560; canvas.height = 236;
      art.appendChild(canvas);

      var body = document.createElement('div');
      body.className = 'd-card__body';

      var title = document.createElement('div');
      title.className = 'd-card__title';
      var name = document.createElement('span');
      name.textContent = game.name;
      title.appendChild(name);
      if (game.badge) {
        var badge = document.createElement('span');
        badge.className = 'd-badge ' + (game.badgeClass || '');
        badge.textContent = game.badge;
        title.appendChild(badge);
      }

      var desc = document.createElement('p');
      desc.className = 'd-card__desc';
      desc.textContent = game.blurb;

      var foot = document.createElement('div');
      foot.className = 'd-card__foot';
      var players = document.createElement('span');
      players.className = 'd-muted';
      players.textContent = '\u25CF ' + game.players + ' PLAYING';
      var play = document.createElement('span');
      play.className = 'd-card__play';
      play.textContent = 'PLAY \u25B6';
      foot.appendChild(players);
      foot.appendChild(play);

      body.appendChild(title);
      body.appendChild(desc);
      body.appendChild(foot);
      a.appendChild(art);
      a.appendChild(body);
      li.appendChild(a);
      grid.appendChild(li);

      var render = ART[game.id];
      if (render) {
        canvases.push({ canvas: canvas, render: render });
        a.addEventListener('pointerenter', function (e) {
          if (e.pointerType === 'mouse') T.sparkle(e.clientX, e.clientY);
        });
        a.addEventListener('click', function () {
          if (window.DegenSound) DegenSound.play('ui', 'click');
        });
      }
    });

    return canvases;
  }

  function animate(canvases) {
    // Scale the backing store to the CSS size so the art is crisp.
    function fit(c) {
      var rect = c.canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(rect.width * dpr));
      var h = Math.max(1, Math.round(rect.height * dpr));
      if (c.canvas.width !== w || c.canvas.height !== h) {
        c.canvas.width = w;
        c.canvas.height = h;
      }
      return { w: w, h: h };
    }

    var t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000;
      for (var i = 0; i < canvases.length; i++) {
        var c = canvases[i];
        var g = c.canvas.getContext('2d');
        var size = fit(c);
        g.save();
        c.render(g, size.w, size.h, t);
        g.restore();
      }
      if (!REDUCED) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    if (REDUCED) {
      canvases.forEach(function (c) {
        var g = c.canvas.getContext('2d');
        var size = fit(c);
        c.render(g, size.w, size.h, 0);
      });
    }
  }

  // -------------------------------------------------------- hero chart -----
  function heroChart() {
    var canvas = $('heroChart');
    if (!canvas) return;

    var series = [];
    var price = 100;
    for (var i = 0; i < 140; i++) {
      price += (Math.random() - 0.48) * 7;
      price = Math.max(22, Math.min(190, price));
      series.push(price);
    }

    function draw(t) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.round(rect.width * dpr));
      var h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      var g = canvas.getContext('2d');
      g.clearRect(0, 0, w, h);

      var step = w / (series.length - 1);
      var min = Math.min.apply(null, series), max = Math.max.apply(null, series);
      var norm = function (v) { return h - ((v - min) / (max - min)) * h * 0.8 - h * 0.1; };
      var drift = (t * 14 * dpr) % step;

      g.beginPath();
      g.moveTo(-drift, norm(series[0]));
      for (var i = 1; i < series.length; i++) g.lineTo(i * step - drift, norm(series[i]));
      g.strokeStyle = 'rgba(0,255,157,0.85)';
      g.lineWidth = 2;
      g.stroke();
      g.lineTo(w, h); g.lineTo(-drift, h); g.closePath();
      g.fillStyle = 'rgba(0,255,157,0.09)';
      g.fill();
    }

    if (REDUCED) { draw(0); return; }
    var start = performance.now();
    (function loop() {
      draw((performance.now() - start) / 1000);
      requestAnimationFrame(loop);
    })();
  }

  // ------------------------------------------------------------- teasers ---
  function buildLeaderboards() {
    var tendies = [
      ['1', 'MoonLander42', '98,420'],
      ['2', 'DiamondHandz', '91,004'],
      ['3', 'RektAgain', '77,318'],
      ['4', 'PumpKing', '64,902'],
      ['5', 'ExitLiquidity', '58,140'],
    ];
    var rugged = [
      ['1', 'BagHolder99', '-412,880'],
      ['2', 'BoughtTheTop', '-388,010'],
      ['3', 'ApedInAgain', '-301,442'],
      ['4', 'NGMIBro', '-288,900'],
      ['5', 'SunkCostSam', '-250,113'],
    ];
    function rows(host, data, cls) {
      if (!host) return;
      host.innerHTML = data.map(function (r) {
        return '<tr><td class="d-lb__rank">' + r[0] + '</td><td>' + r[1] +
          '</td><td style="text-align:right" class="' + cls + '">' + r[2] + '</td></tr>';
      }).join('');
    }
    rows($('lbTendies'), tendies, 'd-green');
    rows($('lbRugged'), rugged, 'd-red');
  }

  // ---------------------------------------------------------------- boot ---
  function boot() {
    buildTicker();
    buildStats();
    var canvases = buildCards();
    animate(canvases);
    heroChart();
    buildLeaderboards();

    var cta = $('ctaPlay');
    if (cta) cta.addEventListener('click', function () {
      if (window.DegenSound) DegenSound.play('game', 'gameStart');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
