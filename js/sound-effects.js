/* ===========================================================================
   DEGENLANDER PORTAL: sound engine

   Replaces the original js/sound-effects.js, which pointed every single sound
   at one MDN "t-rex roar" URL (a demo asset that is no longer hosted), and the
   sounds/*.mp3 files, which were committed as 0-byte placeholders.

   This engine synthesises every effect with the Web Audio API, so there are no
   network requests, nothing to 404, and it still works offline or from file://.

   Public API (kept backwards compatible with every existing call site):
     DegenSound.init(opts)              // opts are ignored; safe to call
     DegenSound.play(group, name)       // legacy two-argument form
     DegenSound.play(name)              // one-argument form
     DegenSound.playSoundEffect(name)
     DegenSound.mute() / .unmute() / .isMuted
     DegenSound.masterVolume
   =========================================================================== */
(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var noiseBuffer = null;
  var unlocked = false;

  var DegenSound = {
    masterVolume: 0.55,
    isMuted: false,
    soundEnabled: true,

    // ------------------------------------------------------------- setup ---
    init: function () {
      if (ctx) return DegenSound;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        DegenSound.soundEnabled = false;
        return DegenSound;
      }
      try {
        ctx = new AC();
      } catch (e) {
        DegenSound.soundEnabled = false;
        return DegenSound;
      }

      master = ctx.createGain();
      master.gain.value = DegenSound.isMuted ? 0 : DegenSound.masterVolume;
      master.connect(ctx.destination);

      // One second of white noise, reused for every percussive/noisy sound.
      var len = Math.floor(ctx.sampleRate);
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      if (localStorage.getItem('degen_muted') === '1') DegenSound.isMuted = true;
      unlockOnGesture();
      return DegenSound;
    },

    // ----------------------------------------------------------- helpers ---
    _resume: function () {
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* noop */ } }
    },

    /** Single oscillator voice. */
    tone: function (opt) {
      if (!ctx || DegenSound.isMuted || !DegenSound.soundEnabled) return;
      var t0 = ctx.currentTime + (opt.delay || 0);
      var dur = opt.dur || 0.12;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = opt.type || 'square';
      osc.frequency.setValueAtTime(opt.from || 440, t0);
      if (opt.to && opt.to !== opt.from) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.to), t0 + dur);
      }

      var vol = (opt.vol == null ? 0.3 : opt.vol);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, dur * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },

    /** Filtered noise burst: explosions, hits, thrust. */
    noise: function (opt) {
      if (!ctx || DegenSound.isMuted || !DegenSound.soundEnabled) return;
      opt = opt || {};
      var t0 = ctx.currentTime + (opt.delay || 0);
      var dur = opt.dur || 0.3;
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;

      var filter = ctx.createBiquadFilter();
      filter.type = opt.filter || 'lowpass';
      filter.frequency.setValueAtTime(opt.from || 1800, t0);
      if (opt.to) filter.frequency.exponentialRampToValueAtTime(Math.max(40, opt.to), t0 + dur);

      var gain = ctx.createGain();
      var vol = opt.vol == null ? 0.3 : opt.vol;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    },

    /** A run of notes. */
    seq: function (notes, opt) {
      opt = opt || {};
      var step = opt.step || 0.07;
      for (var i = 0; i < notes.length; i++) {
        DegenSound.tone({
          from: notes[i],
          to: notes[i],
          dur: opt.dur || step * 1.4,
          type: opt.type || 'square',
          vol: opt.vol == null ? 0.26 : opt.vol,
          delay: i * step,
        });
      }
    },

    // ------------------------------------------------------------- patches ---
    patches: {
      // ---- UI ----
      'ui.click': function () { DegenSound.tone({ from: 880, to: 660, dur: 0.07, type: 'square', vol: 0.22 }); },
      'ui.hover': function () { DegenSound.tone({ from: 1400, to: 1400, dur: 0.03, type: 'sine', vol: 0.1 }); },
      'ui.success': function () { DegenSound.seq([523, 659, 784], { step: 0.075, type: 'square', vol: 0.24 }); },
      'ui.error': function () { DegenSound.tone({ from: 220, to: 110, dur: 0.26, type: 'sawtooth', vol: 0.26 }); },

      // ---- arcade / platformer ----
      'game.collect': function () {
        DegenSound.tone({ from: 988, to: 988, dur: 0.06, type: 'square', vol: 0.26 });
        DegenSound.tone({ from: 1319, to: 1319, dur: 0.12, type: 'square', vol: 0.26, delay: 0.06 });
      },
      'game.jump': function () { DegenSound.tone({ from: 300, to: 780, dur: 0.14, type: 'square', vol: 0.22 }); },
      'game.land': function () {
        DegenSound.tone({ from: 150, to: 60, dur: 0.16, type: 'sine', vol: 0.4 });
        DegenSound.noise({ from: 900, to: 120, dur: 0.16, vol: 0.22 });
      },
      'game.hit': function () {
        DegenSound.noise({ from: 3000, to: 300, dur: 0.12, vol: 0.3 });
        DegenSound.tone({ from: 200, to: 80, dur: 0.1, type: 'square', vol: 0.2 });
      },
      'game.explosion': function () {
        DegenSound.noise({ from: 2600, to: 60, dur: 0.55, vol: 0.42, filter: 'lowpass' });
        DegenSound.tone({ from: 90, to: 30, dur: 0.5, type: 'sawtooth', vol: 0.3 });
      },
      'game.powerUp': function () { DegenSound.seq([523, 659, 784, 1046], { step: 0.05, type: 'square', vol: 0.24 }); },
      'game.levelUp': function () { DegenSound.seq([659, 784, 1046, 1318], { step: 0.09, type: 'triangle', vol: 0.3 }); },
      'game.shoot': function () { DegenSound.tone({ from: 1400, to: 200, dur: 0.1, type: 'sawtooth', vol: 0.2 }); },
      'game.thrust': function () { DegenSound.noise({ from: 420, to: 220, dur: 0.14, vol: 0.14, filter: 'bandpass' }); },

      // ---- casino ----
      'game.spin': function () {
        for (var i = 0; i < 12; i++) {
          DegenSound.tone({ from: 1200 - i * 40, to: 1200 - i * 40, dur: 0.035, type: 'square', vol: 0.14, delay: i * 0.045 });
        }
      },
      'game.reelStop': function () { DegenSound.tone({ from: 500, to: 260, dur: 0.09, type: 'square', vol: 0.24 }); },
      'game.jackpot': function () {
        DegenSound.seq([523, 659, 784, 1046, 1318, 1568], { step: 0.085, type: 'square', vol: 0.32 });
        DegenSound.noise({ from: 4000, to: 800, dur: 0.6, vol: 0.16, filter: 'highpass' });
      },
      'game.win': function () { DegenSound.seq([659, 784, 1046], { step: 0.09, type: 'triangle', vol: 0.3 }); },
      'game.lose': function () { DegenSound.seq([392, 330, 262], { step: 0.11, type: 'sawtooth', vol: 0.24 }); },
      'game.rugpull': function () {
        // Sad-trombone slide.
        DegenSound.tone({ from: 330, to: 300, dur: 0.3, type: 'sawtooth', vol: 0.28 });
        DegenSound.tone({ from: 300, to: 260, dur: 0.3, type: 'sawtooth', vol: 0.28, delay: 0.3 });
        DegenSound.tone({ from: 260, to: 130, dur: 0.8, type: 'sawtooth', vol: 0.3, delay: 0.6 });
      },
      'game.coin': function () {
        DegenSound.tone({ from: 1318, to: 1318, dur: 0.05, type: 'square', vol: 0.24 });
        DegenSound.tone({ from: 1760, to: 1760, dur: 0.14, type: 'square', vol: 0.24, delay: 0.05 });
      },

      // ---- start / end ----
      'game.gameStart': function () { DegenSound.seq([523, 523, 784], { step: 0.1, type: 'square', vol: 0.3 }); },
      'game.gameOver': function () {
        DegenSound.seq([523, 466, 415, 349], { step: 0.16, type: 'triangle', vol: 0.3 });
      },
    },

    // ---------------------------------------------------------------- play ---
    /**
     * play('game', 'explosion')   (legacy form)
     * play('explosion')           (short form)
     */
    play: function (a, b) {
      if (!DegenSound.soundEnabled) return;
      if (!ctx) DegenSound.init();
      if (!ctx) return;
      DegenSound._resume();

      var key = b ? (a + '.' + b) : a;
      var fn = DegenSound.patches[key];

      // Tolerate names used by older call sites that we have no patch for.
      if (!fn) {
        var alias = ALIASES[key] || ALIASES[a];
        if (alias) fn = DegenSound.patches[alias];
      }
      if (fn) { try { fn(); } catch (e) { /* never let audio break gameplay */ } }
      return DegenSound;
    },

    playSoundEffect: function (name) { return DegenSound.play(name); },

    // -------------------------------------------------------------- volume ---
    setVolume: function (v) {
      DegenSound.masterVolume = Math.max(0, Math.min(1, v));
      if (master && !DegenSound.isMuted) master.gain.value = DegenSound.masterVolume;
    },
    mute: function () {
      DegenSound.isMuted = true;
      if (master) master.gain.value = 0;
      try { localStorage.setItem('degen_muted', '1'); } catch (e) { /* noop */ }
    },
    unmute: function () {
      DegenSound.isMuted = false;
      if (master) master.gain.value = DegenSound.masterVolume;
      try { localStorage.setItem('degen_muted', '0'); } catch (e) { /* noop */ }
    },
  };

  // Names used across the existing games that map onto a patch we do have.
  var ALIASES = {
    'ui': 'ui.click',
    'error': 'ui.error',
    'select': 'ui.success',
    'gameStart': 'game.gameStart',
    'gameOver': 'game.gameOver',
    'win': 'game.win',
    'lose': 'game.lose',
    'spin': 'game.spin',
    'reelStop': 'game.reelStop',
    'jackpot': 'game.jackpot',
    'rugpull': 'game.rugpull',
    'buy': 'game.coin',
    'sell': 'game.collect',
    'shill': 'game.powerUp',
    'reset': 'ui.click',
    'game.collect': 'game.collect',
    'game.jump': 'game.jump',
    'game.land': 'game.land',
    'game.powerUp': 'game.powerUp',
    'game.explosion': 'game.explosion',
    'game.levelUp': 'game.levelUp',
    'game.shoot': 'game.shoot',
    'game.thrust': 'game.thrust',
    'game.hit': 'game.hit',
    'game.coin': 'game.coin',
    'game.jackpot': 'game.jackpot',
    'game.spin': 'game.spin',
  };

  // ---------------------------------------------------------------- unlock ---
  // Browsers block audio until the user interacts. Resume the context on the
  // first gesture so the very first click already makes a sound.
  function unlockOnGesture() {
    if (unlocked) return;
    var handler = function () {
      unlocked = true;
      DegenSound._resume();
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
    window.addEventListener('pointerdown', handler, { passive: true });
    window.addEventListener('keydown', handler);
    window.addEventListener('touchstart', handler, { passive: true });
  }

  if (localStorage.getItem('degen_muted') === '1') DegenSound.isMuted = true;
  window.DegenSound = DegenSound;

  // Warm up as soon as the DOM is ready: creating an AudioContext before any
  // gesture is allowed, it just starts suspended.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { DegenSound.init(); });
  } else {
    DegenSound.init();
  }
})();
