/* ===========================================================================
   NERD SOCCER: the learning module

   The previous opponent was not AI. It picked jumps with
   `Math.random() < jumpProbability`, predicted the ball with
   `x + dx * 60` (which ignores wall bounces entirely), and carried a
   `this.strategy = { playerGoals, botGoals, adjustPosition }` object that was
   declared and then never written to. Nothing learned anything.

   This module is three learners that genuinely train, are measurable, and
   persist between sessions:

   1. MLP
      A one-hidden-layer neural network with softmax output, trained by real
      backpropagation with momentum. `gradCheck()` verifies the analytic
      gradients against finite differences, so the maths is testable rather
      than asserted.

   2. IntentModel
      Predicts which band of the goal the human is about to attack (high, mid,
      low) from the pre-contact pose: where they are, how fast they are moving,
      where the ball is, and their recent shooting history. This is the part
      that learns *from the player's behaviour*: every shot the human takes is
      one training example, and the histogram features let it lock onto habits
      within a few shots.

   3. QLearner
      Tabular Q-learning with epsilon-greedy exploration and a decaying
      learning rate. Two of them: one for where the bot should position itself
      to defend (reward = save), one for where it should shoot (reward = goal).
      Rewards come from the actual match, so the policies improve by playing.

   Everything is small enough to run at 60 fps in a browser tab, and the whole
   brain serialises to localStorage so it is still better next time you visit.
   =========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'nerdsoccer_brain_v1';

  function randn(rng) {
    // Box-Muller. Deterministic when the caller passes a seeded rng.
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Seeded PRNG so training runs and self-play are reproducible. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ===================================================================== MLP ===
  /**
   * One hidden layer, tanh activation, softmax output, cross-entropy loss.
   *
   * Weights are laid out as W1[input * nHid + hidden] and
   * W2[hidden * nOut + output]. Scratch buffers are allocated once because this
   * is called from the game loop.
   */
  function MLP(nIn, nHid, nOut, seed) {
    this.nIn = nIn;
    this.nHid = nHid;
    this.nOut = nOut;
    this.rng = mulberry32(seed || 12345);

    this.W1 = new Float64Array(nIn * nHid);
    this.b1 = new Float64Array(nHid);
    this.W2 = new Float64Array(nHid * nOut);
    this.b2 = new Float64Array(nOut);

    // Momentum velocities.
    this.vW1 = new Float64Array(nIn * nHid);
    this.vb1 = new Float64Array(nHid);
    this.vW2 = new Float64Array(nHid * nOut);
    this.vb2 = new Float64Array(nOut);

    this.z1 = new Float64Array(nHid);
    this.h = new Float64Array(nHid);
    this.z2 = new Float64Array(nOut);
    this.p = new Float64Array(nOut);
    this.dz1 = new Float64Array(nHid);
    this.dz2 = new Float64Array(nOut);
    this.gW1 = new Float64Array(nIn * nHid);
    this.gb1 = new Float64Array(nHid);
    this.gW2 = new Float64Array(nHid * nOut);
    this.gb2 = new Float64Array(nOut);

    this.momentum = 0.9;
    this.l2 = 0.0001;
    this.init();
  }

  MLP.prototype.init = function () {
    // Xavier/Glorot scaling keeps tanh out of saturation at the start.
    var s1 = Math.sqrt(1 / this.nIn);
    var s2 = Math.sqrt(1 / this.nHid);
    var i;
    for (i = 0; i < this.W1.length; i++) this.W1[i] = randn(this.rng) * s1;
    for (i = 0; i < this.b1.length; i++) this.b1[i] = 0;
    for (i = 0; i < this.W2.length; i++) this.W2[i] = randn(this.rng) * s2;
    for (i = 0; i < this.b2.length; i++) this.b2[i] = 0;
  };

  MLP.prototype.forward = function (x) {
    var nIn = this.nIn, nHid = this.nHid, nOut = this.nOut;
    var W1 = this.W1, b1 = this.b1, W2 = this.W2, b2 = this.b2;
    var z1 = this.z1, h = this.h, z2 = this.z2, p = this.p;
    var i, j, k;

    for (j = 0; j < nHid; j++) {
      var s = b1[j];
      for (i = 0; i < nIn; i++) s += x[i] * W1[i * nHid + j];
      z1[j] = s;
      h[j] = Math.tanh(s);
    }

    var maxZ = -Infinity;
    for (k = 0; k < nOut; k++) {
      var t = b2[k];
      for (j = 0; j < nHid; j++) t += h[j] * W2[j * nOut + k];
      z2[k] = t;
      if (t > maxZ) maxZ = t;
    }
    // Softmax with the max subtracted, for numerical stability.
    var sum = 0;
    for (k = 0; k < nOut; k++) { p[k] = Math.exp(z2[k] - maxZ); sum += p[k]; }
    for (k = 0; k < nOut; k++) p[k] /= sum;
    return p;
  };

  MLP.prototype.predict = function (x) {
    var p = this.forward(x);
    var best = 0;
    for (var k = 1; k < this.nOut; k++) if (p[k] > p[best]) best = k;
    return { classIndex: best, probs: Array.prototype.slice.call(p), confidence: p[best] };
  };

  /** One SGD step on a single example. Returns the cross-entropy loss. */
  MLP.prototype.train = function (x, label, lr) {
    var nIn = this.nIn, nHid = this.nHid, nOut = this.nOut;
    var h = this.h, W2 = this.W2;
    var dz2 = this.dz2, dz1 = this.dz1;
    var gW1 = this.gW1, gb1 = this.gb1, gW2 = this.gW2, gb2 = this.gb2;
    var p = this.forward(x);
    var i, j, k;

    var loss = -Math.log(Math.max(1e-12, p[label]));

    // dL/dz2 = p - onehot
    for (k = 0; k < nOut; k++) dz2[k] = p[k] - (k === label ? 1 : 0);

    gW2.fill(0); gb2.fill(0); gW1.fill(0); gb1.fill(0);
    for (j = 0; j < nHid; j++) {
      for (k = 0; k < nOut; k++) gW2[j * nOut + k] = h[j] * dz2[k];
    }
    for (k = 0; k < nOut; k++) gb2[k] = dz2[k];

    // dL/dh = W2^T dz2, then through tanh
    for (j = 0; j < nHid; j++) {
      var dh = 0;
      for (k = 0; k < nOut; k++) dh += W2[j * nOut + k] * dz2[k];
      dz1[j] = dh * (1 - h[j] * h[j]);
    }
    for (i = 0; i < nIn; i++) {
      for (j = 0; j < nHid; j++) gW1[i * nHid + j] = x[i] * dz1[j];
    }
    for (j = 0; j < nHid; j++) gb1[j] = dz1[j];

    this.applyGradients(lr);
    return loss;
  };

  MLP.prototype.applyGradients = function (lr) {
    var mu = this.momentum, wd = this.l2, i;
    for (i = 0; i < this.W1.length; i++) {
      var g1 = this.gW1[i] + wd * this.W1[i];
      this.vW1[i] = mu * this.vW1[i] - lr * g1;
      this.W1[i] += this.vW1[i];
    }
    for (i = 0; i < this.b1.length; i++) {
      this.vb1[i] = mu * this.vb1[i] - lr * this.gb1[i];
      this.b1[i] += this.vb1[i];
    }
    for (i = 0; i < this.W2.length; i++) {
      var g2 = this.gW2[i] + wd * this.W2[i];
      this.vW2[i] = mu * this.vW2[i] - lr * g2;
      this.W2[i] += this.vW2[i];
    }
    for (i = 0; i < this.b2.length; i++) {
      this.vb2[i] = mu * this.vb2[i] - lr * this.gb2[i];
      this.b2[i] += this.vb2[i];
    }
  };

  /**
   * Numeric gradient check. Compares the analytic gradient of one weight against
   * a central finite difference. Used by the test suite so the backprop is
   * verified rather than assumed.
   */
  MLP.prototype.gradCheck = function (x, label, eps) {
    eps = eps || 1e-5;
    // Build the analytic gradient for this single example.
    this.forward(x);
    var nHid = this.nHid, nOut = this.nOut;
    var h = this.h, W2 = this.W2, dz2 = this.dz2, dz1 = this.dz1, p = this.p;
    var k, j;
    for (k = 0; k < nOut; k++) dz2[k] = p[k] - (k === label ? 1 : 0);
    for (j = 0; j < nHid; j++) {
      var dh = 0;
      for (k = 0; k < nOut; k++) dh += W2[j * nOut + k] * dz2[k];
      dz1[j] = dh * (1 - h[j] * h[j]);
    }
    var analyticW1 = new Float64Array(this.nIn * nHid);
    for (var i = 0; i < this.nIn; i++) {
      for (j = 0; j < nHid; j++) analyticW1[i * nHid + j] = x[i] * dz1[j];
    }
    var analyticW2 = new Float64Array(nHid * nOut);
    for (j = 0; j < nHid; j++) {
      for (k = 0; k < nOut; k++) analyticW2[j * nOut + k] = h[j] * dz2[k];
    }

    function lossAt() { return -Math.log(Math.max(1e-12, this.forward(x)[label])); }
    var self = this;
    function numeric(arr, idx) {
      var orig = arr[idx];
      arr[idx] = orig + eps;
      var lp = -Math.log(Math.max(1e-12, self.forward(x)[label]));
      arr[idx] = orig - eps;
      var lm = -Math.log(Math.max(1e-12, self.forward(x)[label]));
      arr[idx] = orig;
      return (lp - lm) / (2 * eps);
    }

    var maxErr = 0;
    var probes = [0, 1, 7, 13, 23];
    for (var q = 0; q < probes.length; q++) {
      var idx1 = probes[q] % this.W1.length;
      var n1 = numeric(this.W1, idx1);
      maxErr = Math.max(maxErr, Math.abs(n1 - analyticW1[idx1]));
      var idx2 = probes[q] % this.W2.length;
      var n2 = numeric(this.W2, idx2);
      maxErr = Math.max(maxErr, Math.abs(n2 - analyticW2[idx2]));
    }
    return maxErr;
  };

  MLP.prototype.toJSON = function () {
    return {
      nIn: this.nIn, nHid: this.nHid, nOut: this.nOut,
      W1: Array.prototype.slice.call(this.W1),
      b1: Array.prototype.slice.call(this.b1),
      W2: Array.prototype.slice.call(this.W2),
      b2: Array.prototype.slice.call(this.b2)
    };
  };

  MLP.fromJSON = function (o) {
    var m = new MLP(o.nIn, o.nHid, o.nOut, 1);
    m.W1 = Float64Array.from(o.W1);
    m.b1 = Float64Array.from(o.b1);
    m.W2 = Float64Array.from(o.W2);
    m.b2 = Float64Array.from(o.b2);
    return m;
  };

  // =============================================================== QLearner ===
  /**
   * Tabular Q-learning. States are strings; actions are small integers.
   * Defaults to optimistic-zero values and decays epsilon as it gains experience.
   */
  function QLearner(nActions, opts) {
    opts = opts || {};
    this.nActions = nActions;
    this.alpha = opts.alpha || 0.18;
    this.gamma = opts.gamma == null ? 0.92 : opts.gamma;
    this.epsilon = opts.epsilon == null ? 0.35 : opts.epsilon;
    this.epsilonMin = opts.epsilonMin == null ? 0.04 : opts.epsilonMin;
    this.epsilonDecay = opts.epsilonDecay || 0.9995;
    this.rng = mulberry32(opts.seed || 777);
    this.table = Object.create(null);
    this.updates = 0;
  }

  QLearner.prototype.values = function (state) {
    var v = this.table[state];
    if (!v) { v = new Float64Array(this.nActions); this.table[state] = v; }
    return v;
  };

  QLearner.prototype.argmax = function (state, rng) {
    var v = this.values(state);
    var best = 0;
    var ties = 0;
    for (var a = 0; a < this.nActions; a++) {
      if (v[a] > v[best] + 1e-12) { best = a; ties = 0; }
      else if (Math.abs(v[a] - v[best]) <= 1e-12) ties++;
    }
    if (ties > 0 && rng) {
      // Break ties randomly so symmetry does not freeze the policy.
      var pick = Math.floor(rng() * (ties + 1));
      var seen = 0;
      for (var b = 0; b < this.nActions; b++) {
        if (Math.abs(v[b] - v[best]) <= 1e-12) {
          if (seen === pick) return b;
          seen++;
        }
      }
    }
    return best;
  };

  QLearner.prototype.act = function (state) {
    if (this.rng() < this.epsilon) return Math.floor(this.rng() * this.nActions);
    return this.argmax(state, this.rng);
  };

  /** Greedy action, for play once training is done. */
  QLearner.prototype.best = function (state) { return this.argmax(state, null); };

  QLearner.prototype.update = function (state, action, reward, nextState, done) {
    var v = this.values(state);
    var target = reward;
    if (!done) {
      var nv = this.values(nextState);
      var m = -Infinity;
      for (var a = 0; a < this.nActions; a++) if (nv[a] > m) m = nv[a];
      target = reward + this.gamma * m;
    }
    v[action] += this.alpha * (target - v[action]);
    this.updates++;
    if (this.epsilon > this.epsilonMin) this.epsilon *= this.epsilonDecay;
    return target;
  };

  QLearner.prototype.toJSON = function () {
    var out = {};
    for (var k in this.table) out[k] = Array.prototype.slice.call(this.table[k]);
    return { nActions: this.nActions, epsilon: this.epsilon, updates: this.updates, table: out };
  };

  QLearner.prototype.loadJSON = function (o) {
    if (!o) return;
    this.epsilon = o.epsilon == null ? this.epsilon : o.epsilon;
    this.updates = o.updates || 0;
    this.table = Object.create(null);
    for (var k in o.table) this.table[k] = Float64Array.from(o.table[k]);
  };

  QLearner.prototype.size = function () { return Object.keys(this.table).length; };

  // ============================================================ IntentModel ===
  var N_BANDS = 3;            // 0 = high, 1 = mid, 2 = low
  // 14 raw pose features plus the derived contact geometry. A keeper really does
  // see where the ball is relative to the striker's foot and how fast they are
  // closing, and without those the network was being asked to infer the contact
  // normal from a 14-dimensional pose, which it could not do from a few hundred
  // examples. With them, the remaining job is learning the trajectory
  // projection, which is a smooth and genuinely learnable function.
  var N_FEATURES = 17;

  /**
   * Encode the pre-contact situation into a fixed feature vector.
   *
   * Deliberately does NOT include the ball's outgoing velocity: the model has to
   * predict where the shot is going from the pose and the player's history,
   * which is the part that is actually about behaviour.
   */
  function encodeObs(o, out) {
    var v = out || new Float64Array(N_FEATURES);
    v[0] = o.sx;
    v[1] = o.sy;
    v[2] = o.svx / 12;
    v[3] = o.svy / 12;
    v[4] = o.bx;
    v[5] = o.by;
    v[6] = o.bvx / 20;
    v[7] = o.bvy / 20;
    v[8] = o.dx;
    v[9] = o.dy;
    v[10] = o.histHigh;
    v[11] = o.histMid;
    v[12] = o.histLow;
    v[13] = o.scoreDiff / 5;

    // Derived contact geometry, computed here so every caller gets it for free.
    var dxm = (o.bx - o.sx) * 15;         // back to metres (arena is 15 m wide)
    var dym = (o.by - o.sy) * 8.667;
    var d = Math.sqrt(dxm * dxm + dym * dym) || 1e-6;
    var nx = dxm / d, ny = dym / d;
    var rvx = o.bvx - o.svx, rvy = o.bvy - o.svy;
    v[14] = nx;
    v[15] = ny;
    v[16] = Math.max(0, -(rvx * nx + rvy * ny)) / 10;   // closing speed
    return v;
  }

  /**
   * Wraps the MLP with a recency histogram and an exponentially-weighted
   * forgetting factor, so a player who changes their habits is followed rather
   * than averaged forever.
   */
  function IntentModel(seed) {
    this.net = new MLP(N_FEATURES, 26, N_BANDS, seed || 4242);
    this.counts = [1, 1, 1];        // Laplace-smoothed band histogram
    this.decay = 0.985;             // per-shot forgetting
    this.lr = 0.05;
    this.trained = 0;
    this.lossEMA = 0;
    this.recent = [];               // last N (predicted, actual) for accuracy
    this.recentMax = 25;
  }

  IntentModel.prototype.histogram = function () {
    var c = this.counts;
    var t = c[0] + c[1] + c[2];
    return [c[0] / t, c[1] / t, c[2] / t];
  };

  IntentModel.prototype.observe = function (obs, actualBand) {
    var v = encodeObs(obs);
    var pred = this.net.predict(v);
    this.recent.push(pred.classIndex === actualBand ? 1 : 0);
    if (this.recent.length > this.recentMax) this.recent.shift();

    var loss = this.net.train(v, actualBand, this.lr);
    this.lossEMA = this.lossEMA === 0 ? loss : this.lossEMA * 0.94 + loss * 0.06;

    // Recency-weighted histogram of what the player actually does.
    var c = this.counts;
    c[0] *= this.decay; c[1] *= this.decay; c[2] *= this.decay;
    c[actualBand] += 1;
    this.trained++;
    return loss;
  };

  /** Train without touching the live histogram, for offline/self-play data. */
  IntentModel.prototype.fit = function (obs, actualBand, lr) {
    return this.net.train(encodeObs(obs), actualBand, lr == null ? this.lr : lr);
  };

  IntentModel.prototype.predict = function (obs) {
    var v = encodeObs(obs);
    var p = this.net.predict(v);
    // Blend the network with the raw histogram. The network generalises across
    // poses; the histogram is a strong, low-variance prior on habits. Early on
    // the histogram dominates, later the network carries more weight.
    var w = Math.min(0.75, this.trained / 60);
    var h = this.histogram();
    var blended = [0, 0, 0];
    for (var k = 0; k < N_BANDS; k++) blended[k] = w * p.probs[k] + (1 - w) * h[k];
    var best = 0;
    for (k = 1; k < N_BANDS; k++) if (blended[k] > blended[best]) best = k;
    return {
      band: best,
      probs: blended,
      netProbs: p.probs,
      hist: h,
      confidence: blended[best],
      blendWeight: w
    };
  };

  IntentModel.prototype.accuracy = function () {
    if (!this.recent.length) return 0;
    var s = 0;
    for (var i = 0; i < this.recent.length; i++) s += this.recent[i];
    return s / this.recent.length;
  };

  IntentModel.prototype.toJSON = function () {
    return {
      net: this.net.toJSON(), counts: this.counts.slice(),
      trained: this.trained, lossEMA: this.lossEMA, recent: this.recent.slice()
    };
  };

  IntentModel.prototype.loadJSON = function (o) {
    if (!o) return;
    this.net = MLP.fromJSON(o.net);
    this.counts = o.counts ? o.counts.slice() : [1, 1, 1];
    this.trained = o.trained || 0;
    this.lossEMA = o.lossEMA || 0;
    this.recent = o.recent ? o.recent.slice() : [];
  };

  // ================================================================== Brain ===
  // Defensive actions, ordered by where they move the bot.
  var DEFEND_ACTIONS = ['dashHigh', 'high', 'hold', 'low', 'dashLow'];
  // Attacking bands.
  var ATTACK_ACTIONS = [0, 1, 2];

  /**
   * The whole opponent: an intent model plus two Q-learners plus the statistics
   * the UI shows. `key(...)` builds the discretised state strings.
   */
  function Brain(seed) {
    this.intent = new IntentModel(seed || 909);
    this.defence = new QLearner(DEFEND_ACTIONS.length, { alpha: 0.20, gamma: 0.9, epsilon: 0.30, seed: 31 });
    this.attack = new QLearner(ATTACK_ACTIONS.length, { alpha: 0.22, gamma: 0.85, epsilon: 0.25, seed: 57 });
    this.episodes = 0;
    this.saves = 0;
    this.conceded = 0;
    this.goalsFor = 0;
    this.shotsTaken = 0;
    this.saveWindow = [];
    this.windowMax = 20;
    this.lastPrediction = null;
    this.lastDefenceState = null;
    this.lastDefenceAction = null;
    this.lastAttackState = null;
    this.lastAttackAction = null;
  }

  function bucket(v, edges) {
    for (var i = 0; i < edges.length; i++) if (v < edges[i]) return i;
    return edges.length;
  }

  /** Discretise the defensive situation: 3 bands x 3 ball distances x 3 offsets. */
  Brain.prototype.defenceKey = function (predictedBand, ballDistNorm, botOffsetNorm) {
    var b = predictedBand | 0;
    var d = bucket(ballDistNorm, [0.33, 0.66]);
    var o = bucket(botOffsetNorm, [-0.25, 0.25]);
    return 'D' + b + d + o;
  };

  /** Discretise the attacking situation: what the human has been doing lately. */
  Brain.prototype.attackKey = function (humanHigh, humanLow, botPosNorm) {
    var h = bucket(humanHigh, [0.3, 0.55]);
    var l = bucket(humanLow, [0.3, 0.55]);
    var p = bucket(botPosNorm, [0.3, 0.7]);
    return 'A' + h + l + p;
  };

  /** Choose where to move to defend. Returns an index into DEFEND_ACTIONS. */
  Brain.prototype.decideDefence = function (obs, ballDistNorm, botOffsetNorm) {
    var pred = this.intent.predict(obs);
    this.lastPrediction = pred;
    // Blend the learned policy with the model's read. The Q-table learns how
    // much the read is worth in practice; the prior keeps it from being
    // completely wrong before it has seen many shots.
    var key = this.defenceKey(pred.band, ballDistNorm, botOffsetNorm);
    var action = this.defence.act(key);
    if (pred.confidence > 0.62 && this.defence.updates > 400) {
      // Confident read: bias toward the matching action, but keep exploring.
      var bias = [0, 1, 2, 3, 4][pred.band === 0 ? 1 : (pred.band === 2 ? 3 : 2)];
      if (this.defence.rng() > this.defence.epsilon) action = bias;
    }
    this.lastDefenceState = key;
    this.lastDefenceAction = action;
    return { action: action, actionName: DEFEND_ACTIONS[action], prediction: pred };
  };

  Brain.prototype.rewardDefence = function (reward, nextKey) {
    if (this.lastDefenceState == null) return;
    this.defence.update(this.lastDefenceState, this.lastDefenceAction, reward, nextKey || this.lastDefenceState, true);
    var saved = reward > 0 ? 1 : 0;
    this.saveWindow.push(saved);
    if (this.saveWindow.length > this.windowMax) this.saveWindow.shift();
    if (saved) this.saves++; else this.conceded++;
  };

  Brain.prototype.saveRate = function () {
    if (!this.saveWindow.length) return 0;
    var s = 0;
    for (var i = 0; i < this.saveWindow.length; i++) s += this.saveWindow[i];
    return s / this.saveWindow.length;
  };

  Brain.prototype.decideAttack = function (obs) {
    var h = this.intent.histogram();
    var key = this.attackKey(h[0], h[2], obs.sy);
    var action = this.attack.act(key);
    this.lastAttackState = key;
    this.lastAttackAction = action;
    return action;   // the band to aim at
  };

  Brain.prototype.rewardAttack = function (scored) {
    if (this.lastAttackState == null) return;
    this.attack.update(this.lastAttackState, this.lastAttackAction, scored ? 1 : -1, this.lastAttackState, true);
    this.shotsTaken++;
    if (scored) this.goalsFor++;
  };

  Brain.prototype.observeHumanShot = function (obs, band) {
    return this.intent.observe(obs, band);
  };

  Brain.prototype.stats = function () {
    return {
      shotsSeen: this.intent.trained,
      intentAccuracy: this.intent.accuracy(),
      loss: this.intent.lossEMA,
      episodes: this.episodes,
      epsilonDefence: this.defence.epsilon,
      defenceStates: this.defence.size(),
      defenceUpdates: this.defence.updates,
      attackStates: this.attack.size(),
      attackUpdates: this.attack.updates,
      saveRate: this.saveRate(),
      saves: this.saves,
      conceded: this.conceded,
      goalsFor: this.goalsFor,
      humanHist: this.intent.histogram(),
      prediction: this.lastPrediction ? {
        band: this.lastPrediction.band,
        confidence: this.lastPrediction.confidence,
        probs: this.lastPrediction.probs
      } : null
    };
  };

  Brain.prototype.save = function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        intent: this.intent.toJSON(),
        defence: this.defence.toJSON(),
        attack: this.attack.toJSON(),
        episodes: this.episodes,
        saves: this.saves,
        conceded: this.conceded,
        goalsFor: this.goalsFor,
        shotsTaken: this.shotsTaken
      }));
      return true;
    } catch (e) { return false; }
  };

  Brain.prototype.load = function () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var o = JSON.parse(raw);
      this.intent.loadJSON(o.intent);
      this.defence.loadJSON(o.defence);
      this.attack.loadJSON(o.attack);
      this.episodes = o.episodes || 0;
      this.saves = o.saves || 0;
      this.conceded = o.conceded || 0;
      this.goalsFor = o.goalsFor || 0;
      this.shotsTaken = o.shotsTaken || 0;
      return true;
    } catch (e) { return false; }
  };

  Brain.prototype.reset = function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    this.intent = new IntentModel(909);
    this.defence = new QLearner(DEFEND_ACTIONS.length, { alpha: 0.20, gamma: 0.9, epsilon: 0.30, seed: 31 });
    this.attack = new QLearner(ATTACK_ACTIONS.length, { alpha: 0.22, gamma: 0.85, epsilon: 0.25, seed: 57 });
    this.episodes = 0; this.saves = 0; this.conceded = 0;
    this.goalsFor = 0; this.shotsTaken = 0;
    this.saveWindow = [];
  };

  /**
   * Scripted opponent habits used for warm-up. Each has a bias the intent model
   * can learn, which is what makes the pretraining meaningful rather than noise.
   */
  var HABITS = [
    { name: 'alwaysLow', mix: [0.05, 0.15, 0.80] },
    { name: 'alwaysHigh', mix: [0.78, 0.14, 0.08] },
    { name: 'mirror', mix: null },          // aims at the opposite side to the keeper
    { name: 'random', mix: [0.33, 0.34, 0.33] },
    { name: 'alternating', mix: null }
  ];

  function pickBand(habit, rng, ctx) {
    if (habit.name === 'mirror') {
      return ctx && ctx.keeperHigh ? 2 : 0;
    }
    if (habit.name === 'alternating') {
      return (Math.floor(rng() * 3) + (ctx && ctx.shotIndex || 0)) % 3;
    }
    var r = rng();
    if (r < habit.mix[0]) return 0;
    if (r < habit.mix[0] + habit.mix[1]) return 1;
    return 2;
  }

  window.SoccerAI = {
    MLP: MLP,
    QLearner: QLearner,
    IntentModel: IntentModel,
    Brain: Brain,
    encodeObs: encodeObs,
    N_BANDS: N_BANDS,
    N_FEATURES: N_FEATURES,
    DEFEND_ACTIONS: DEFEND_ACTIONS,
    HABITS: HABITS,
    pickBand: pickBand,
    mulberry32: mulberry32
  };
})();
