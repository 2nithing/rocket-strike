/* Rocket Strike — Meteor Run
   A dependency-free canvas arcade shooter. */
(() => {
  'use strict';

  /* ------------------------------------------------------------ helpers */

  const TAU = Math.PI * 2;
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pick = (list) => list[(Math.random() * list.length) | 0];
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  const FONT_DISPLAY = '"Bahnschrift", "Eurostile", "Arial Narrow", "Segoe UI", sans-serif';

  const BEST_KEY = 'rocketStrikeBest';
  const MUTE_KEY = 'rocketStrikeMuted';

  const MAX_LIVES = 3;
  const FIRE_RATE = 0.115;
  const BULLET_SPEED = 980;
  const PLAYER_ACCEL = 3000;
  const PLAYER_MAX_SPEED = 470;
  const PLAYER_RADIUS = 15;
  const COMBO_WINDOW = 2.6;
  const WAVE_DURATION = 18;
  const BOTTOM_MARGIN = 70;

  const storage = {
    get(key, fallback) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch (error) {
        /* storage unavailable — ignore */
      }
    },
  };

  const METEOR_TYPES = {
    large: { r: [32, 42], points: 20, speed: 0.82, splits: 3, splitType: 'medium' },
    medium: { r: [21, 28], points: 35, speed: 1, splits: 2, splitType: 'small' },
    small: { r: [12, 17], points: 55, speed: 1.22, splits: 0, splitType: null },
  };

  /* --------------------------------------------------------------- audio */

  const Sound = (() => {
    let audio = null;
    let master = null;
    let noise = null;
    let muted = storage.get(MUTE_KEY, '0') === '1';

    function ensure() {
      if (audio) return audio;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
      master = audio.createGain();
      master.gain.value = 0.5;
      master.connect(audio.destination);
      return audio;
    }

    function context() {
      const a = ensure();
      if (!a) return null;
      if (a.state === 'suspended') a.resume();
      return muted ? null : a;
    }

    function tone(freq, freqEnd, duration, type = 'sine', volume = 0.1, delay = 0) {
      const a = context();
      if (!a) return;
      const start = a.currentTime + delay;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (freqEnd && freqEnd !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), start + duration);
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.03);
    }

    function noiseBurst(duration, volume, from, to) {
      const a = context();
      if (!a) return;
      if (!noise) {
        const length = Math.floor(a.sampleRate * 0.6);
        noise = a.createBuffer(1, length, a.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      }
      const start = a.currentTime;
      const source = a.createBufferSource();
      source.buffer = noise;
      const filter = a.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(from, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), start + duration);
      const gain = a.createGain();
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter).connect(gain).connect(master);
      source.start(start);
      source.stop(start + duration + 0.02);
    }

    return {
      get muted() {
        return muted;
      },
      toggle() {
        muted = !muted;
        return muted;
      },
      unlock() {
        const a = ensure();
        if (a && a.state === 'suspended') a.resume();
      },
      shoot() {
        tone(rand(760, 900), 250, 0.07, 'square', 0.032);
      },
      crack(big) {
        noiseBurst(big ? 0.3 : 0.16, big ? 0.22 : 0.11, big ? 2200 : 3200, 220);
        tone(big ? 140 : 220, 70, 0.16, 'triangle', 0.055);
      },
      hurt() {
        noiseBurst(0.42, 0.3, 1800, 90);
        tone(190, 48, 0.45, 'sawtooth', 0.13);
      },
      wave() {
        tone(520, 520, 0.09, 'triangle', 0.055);
        tone(780, 780, 0.13, 'triangle', 0.055, 0.1);
      },
      gameOver() {
        [392, 311, 233].forEach((freq, index) => {
          tone(freq, freq * 0.5, 0.36, 'triangle', 0.09, index * 0.18);
        });
      },
      ui() {
        tone(680, 680, 0.05, 'triangle', 0.045);
      },
    };
  })();

  /* ----------------------------------------------------------------- DOM */

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  const el = {
    score: document.getElementById('scoreValue'),
    best: document.getElementById('bestValue'),
    wave: document.getElementById('waveValue'),
    combo: document.getElementById('comboBadge'),
    lives: document.getElementById('lives'),
    startBest: document.getElementById('startBest'),
    hint: document.querySelector('.controls-hint'),
    startOverlay: document.getElementById('startOverlay'),
    overOverlay: document.getElementById('overOverlay'),
    pauseOverlay: document.getElementById('pauseOverlay'),
    startButton: document.getElementById('startButton'),
    restartButton: document.getElementById('restartButton'),
    resumeButton: document.getElementById('resumeButton'),
    pauseRestartButton: document.getElementById('pauseRestartButton'),
    soundButton: document.getElementById('soundButton'),
    finalScore: document.getElementById('finalScore'),
    finalBest: document.getElementById('finalBest'),
    finalWave: document.getElementById('finalWave'),
    newRecord: document.getElementById('newRecord'),
  };

  const showOverlay = (node) => node.classList.remove('hidden');
  const hideOverlay = (node) => node.classList.add('hidden');

  /* ---------------------------------------------------------------- view */

  const view = { w: 0, h: 0, dpr: 1 };
  const background = document.createElement('canvas');
  let stars = [];

  function buildBackground() {
    background.width = Math.max(1, Math.round(view.w * view.dpr));
    background.height = Math.max(1, Math.round(view.h * view.dpr));
    const b = background.getContext('2d');
    b.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

    const base = b.createLinearGradient(0, 0, 0, view.h);
    base.addColorStop(0, '#05070f');
    base.addColorStop(0.55, '#070a16');
    base.addColorStop(1, '#0b0714');
    b.fillStyle = base;
    b.fillRect(0, 0, view.w, view.h);

    const reach = Math.max(view.w, view.h);
    const blobs = [
      { x: view.w * 0.16, y: view.h * 0.2, r: reach * 0.4, c: 'rgba(93, 242, 255, 0.1)' },
      { x: view.w * 0.86, y: view.h * 0.62, r: reach * 0.45, c: 'rgba(255, 79, 154, 0.09)' },
      { x: view.w * 0.48, y: view.h * 0.06, r: reach * 0.32, c: 'rgba(126, 96, 255, 0.09)' },
      { x: view.w * 0.32, y: view.h * 0.92, r: reach * 0.38, c: 'rgba(255, 160, 80, 0.05)' },
    ];

    for (const blob of blobs) {
      const glow = b.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
      glow.addColorStop(0, blob.c);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      b.fillStyle = glow;
      b.fillRect(0, 0, view.w, view.h);
    }
  }

  function initStars() {
    stars = [];
    const count = clamp(Math.round((view.w * view.h) / 9000), 70, 230);
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: Math.random() * view.w,
        y: Math.random() * view.h,
        z: rand(0.22, 1),
        tw: rand(0, TAU),
        tint: Math.random() < 0.25,
      });
    }
  }

  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = Math.max(320, canvas.clientWidth || window.innerWidth);
    view.h = Math.max(320, canvas.clientHeight || window.innerHeight);

    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

    buildBackground();
    initStars();

    if (state.player) {
      state.player.x = clamp(state.player.x, 30, view.w - 30);
      state.player.y = clamp(state.player.y, 80, view.h - BOTTOM_MARGIN);
    }
  }

  /* --------------------------------------------------------------- state */

  const state = {
    mode: 'ready', // ready | playing | paused | dying | over
    time: 0,
    elapsed: 0,
    wave: 1,
    score: 0,
    best: Number(storage.get(BEST_KEY, '0')) || 0,
    lives: MAX_LIVES,
    combo: 0,
    comboTimer: 0,
    spawnTimer: 1,
    ambientTimer: 0,
    trailTimer: 0,
    deathTimer: 0,
    shake: 0,
    flash: 0,
    player: null,
  };

  const meteors = [];
  const bullets = [];
  const particles = [];
  const rings = [];
  const texts = [];

  const keys = { up: false, down: false, left: false, right: false, fire: false };
  const pointer = { active: false, id: null, x: 0, y: 0 };

  /* ----------------------------------------------------------- entity fx */

  function addParticle(x, y, vx, vy, life, size, color, gravity = 0, drag = 2.4) {
    if (particles.length > 540) return;
    particles.push({ x, y, vx, vy, life, max: life, size, color, gravity, drag });
  }

  function explode(x, y, power = 1) {
    const count = Math.round(clamp(16 * power, 8, 42));
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, TAU);
      const speed = rand(40, 265) * power;
      addParticle(
        x + rand(-6, 6),
        y + rand(-6, 6),
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        rand(0.3, 0.85) * (0.8 + power * 0.4),
        rand(1.2, 3.4),
        pick(['#fff3c4', '#ffd27a', '#ff9a5c', '#ff6b6b', '#bff8ff']),
        32,
        2.8
      );
    }
    rings.push({ x, y, r: 4, speed: 220 * power, life: 0.45, max: 0.45, color: 'rgba(255, 196, 120, 0.85)' });
    state.shake = Math.max(state.shake, 4 + power * 4);
  }

  function addText(x, y, text, size, color, life = 1.4, vy = -14) {
    texts.push({ x, y, text, size, color, life, max: life, vy });
  }

  function announceWave() {
    addText(view.w / 2, view.h * 0.3, `WAVE ${state.wave}`, clamp(view.w * 0.055, 28, 52), '#7df6ff', 1.6, -8);
  }

  /* --------------------------------------------------------------- score */

  function comboMultiplier() {
    return 1 + Math.min(5, Math.floor(state.combo / 4));
  }

  function resetCombo() {
    state.combo = 0;
    state.comboTimer = 0;
  }

  function addScore(base, x, y) {
    state.combo += 1;
    state.comboTimer = COMBO_WINDOW;
    const multiplier = comboMultiplier();
    const gained = Math.round(base * multiplier);
    state.score += gained;
    addText(
      x,
      y - 6,
      `+${gained}`,
      multiplier > 1 ? 24 : 19,
      multiplier > 1 ? '#ffd27a' : '#c8faff',
      0.85,
      -46
    );
  }

  /* -------------------------------------------------------------- player */

  function createPlayer() {
    return {
      x: view.w / 2,
      y: view.h * 0.78,
      vx: 0,
      vy: 0,
      bank: 0,
      radius: PLAYER_RADIUS,
      cooldown: 0,
      invuln: 1.4,
      thrust: 0.35,
      alive: true,
    };
  }

  function fireBullet(player) {
    const noseX = player.x + Math.sin(player.bank) * 24;
    const noseY = player.y - Math.cos(player.bank) * 24;
    bullets.push({
      x: noseX,
      y: noseY,
      vx: player.vx * 0.15,
      vy: -BULLET_SPEED,
      life: 1.5,
    });
    for (let i = 0; i < 2; i += 1) {
      addParticle(
        noseX + rand(-2, 2),
        noseY,
        rand(-45, 45),
        rand(-260, -120),
        rand(0.08, 0.18),
        rand(1, 2.4),
        '#bff8ff',
        0,
        5
      );
    }
    Sound.shoot();
  }

  function updatePlayer(dt) {
    const player = state.player;
    if (!player.alive) return;

    player.invuln = Math.max(0, player.invuln - dt);
    player.cooldown = Math.max(0, player.cooldown - dt);

    if (pointer.active) {
      const ease = 1 - Math.exp(-10 * dt);
      const targetX = clamp((pointer.x - player.x) * 8, -PLAYER_MAX_SPEED, PLAYER_MAX_SPEED);
      const targetY = clamp((pointer.y - player.y) * 8, -PLAYER_MAX_SPEED, PLAYER_MAX_SPEED);
      player.vx += (targetX - player.vx) * ease;
      player.vy += (targetY - player.vy) * ease;
    } else {
      const ax = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const ay = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (ax) player.vx += ax * PLAYER_ACCEL * dt;
      if (ay) player.vy += ay * PLAYER_ACCEL * dt;
      const drag = Math.exp(-6.5 * dt);
      player.vx *= drag;
      player.vy *= drag;
      player.vx = clamp(player.vx, -PLAYER_MAX_SPEED, PLAYER_MAX_SPEED);
      player.vy = clamp(player.vy, -PLAYER_MAX_SPEED, PLAYER_MAX_SPEED);
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    const padX = 26;
    const minY = 72;
    const maxY = view.h - BOTTOM_MARGIN;
    if (player.x < padX) {
      player.x = padX;
      player.vx = Math.max(0, player.vx);
    } else if (player.x > view.w - padX) {
      player.x = view.w - padX;
      player.vx = Math.min(0, player.vx);
    }
    if (player.y < minY) {
      player.y = minY;
      player.vy = Math.max(0, player.vy);
    } else if (player.y > maxY) {
      player.y = maxY;
      player.vy = Math.min(0, player.vy);
    }

    const bankTarget = clamp(player.vx / PLAYER_MAX_SPEED, -1, 1) * 0.42;
    player.bank += (bankTarget - player.bank) * (1 - Math.exp(-10 * dt));

    const thrusting = keys.up || (pointer.active && pointer.y < player.y - 10) || player.vy < -30;
    player.thrust += ((thrusting ? 1 : 0.32) - player.thrust) * (1 - Math.exp(-8 * dt));

    state.trailTimer -= dt;
    if (state.trailTimer <= 0) {
      state.trailTimer = 0.028;
      addParticle(
        player.x + rand(-3, 3) - Math.sin(player.bank) * 10,
        player.y + 17,
        rand(-20, 20) - player.vx * 0.12,
        rand(60, 150) + player.vy * 0.1,
        rand(0.2, 0.4),
        rand(1.4, 3.1),
        Math.random() < 0.25 ? '#ffd08a' : '#6ff5ff',
        0,
        1.4
      );
    }

    if ((keys.fire || pointer.active) && player.cooldown <= 0) {
      fireBullet(player);
      player.cooldown = FIRE_RATE;
    }
  }

  function damagePlayer() {
    const player = state.player;
    if (!player || !player.alive || player.invuln > 0) return;

    state.lives -= 1;
    state.flash = 0.7;
    resetCombo();
    explode(player.x, player.y, 1.5);
    Sound.hurt();

    if (navigator.vibrate) navigator.vibrate(45);

    for (let i = meteors.length - 1; i >= 0; i -= 1) {
      const meteor = meteors[i];
      if (dist(meteor.x, meteor.y, player.x, player.y) < 210) {
        explode(meteor.x, meteor.y, 0.7);
        meteors.splice(i, 1);
      }
    }

    if (state.lives <= 0) {
      state.lives = 0;
      player.alive = false;
      state.mode = 'dying';
      state.deathTimer = 1.15;
      state.shake = 24;
      explode(player.x, player.y, 2.2);
      Sound.gameOver();
    } else {
      player.invuln = 2.4;
    }
  }

  /* ------------------------------------------------------------- meteors */

  function makeShape() {
    const count = 8 + Math.floor(Math.random() * 4);
    const points = [];
    for (let i = 0; i < count; i += 1) {
      points.push({ a: (i / count) * TAU, r: rand(0.76, 1.06) });
    }
    return points;
  }

  function makeCraters() {
    const count = 3 + Math.floor(Math.random() * 3);
    const craters = [];
    for (let i = 0; i < count; i += 1) {
      craters.push({
        x: rand(-0.48, 0.48),
        y: rand(-0.48, 0.48),
        r: rand(0.08, 0.2),
      });
    }
    return craters;
  }

  function spawnMeteor(type, x, y, vx, vy) {
    const spec = METEOR_TYPES[type];
    const radius = rand(spec.r[0], spec.r[1]);
    const meteor = {
      type,
      r: radius,
      x: x !== undefined ? x : rand(radius + 18, Math.max(radius + 19, view.w - radius - 18)),
      y: y !== undefined ? y : -radius - rand(0, 50),
      vx: vx !== undefined ? vx : rand(-45, 45),
      vy: vy !== undefined ? vy : rand(70, 115) * spec.speed * (1 + (state.wave - 1) * 0.07),
      rot: rand(0, TAU),
      spin: rand(-1.1, 1.1),
      shape: makeShape(),
      craters: makeCraters(),
    };
    meteors.push(meteor);
    return meteor;
  }

  function destroyMeteor(index) {
    const meteor = meteors[index];
    if (!meteor) return;
    meteors.splice(index, 1);

    const spec = METEOR_TYPES[meteor.type];
    addScore(spec.points, meteor.x, meteor.y);
    explode(meteor.x, meteor.y, meteor.type === 'large' ? 1.15 : meteor.type === 'medium' ? 0.8 : 0.55);
    Sound.crack(meteor.type === 'large');

    for (let i = 0; i < spec.splits; i += 1) {
      const spread = spec.splits > 1 ? (i / (spec.splits - 1) - 0.5) * 170 : 0;
      spawnMeteor(
        spec.splitType,
        meteor.x + rand(-8, 8),
        meteor.y + rand(-8, 8),
        meteor.vx + spread + rand(-30, 30),
        Math.abs(meteor.vy) * rand(0.85, 1.15)
      );
    }
  }

  function updateMeteors(dt) {
    for (let i = meteors.length - 1; i >= 0; i -= 1) {
      const meteor = meteors[i];
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.rot += meteor.spin * dt;
      meteor.vx *= Math.exp(-0.15 * dt);

      if (meteor.x < meteor.r) {
        meteor.x = meteor.r;
        meteor.vx = Math.abs(meteor.vx) * 0.9;
      } else if (meteor.x > view.w - meteor.r) {
        meteor.x = view.w - meteor.r;
        meteor.vx = -Math.abs(meteor.vx) * 0.9;
      }

      if (state.mode === 'playing' && state.player && state.player.alive) {
        const player = state.player;
        const reach = meteor.r * 0.85 + player.radius;
        if (dist(meteor.x, meteor.y, player.x, player.y) < reach) {
          damagePlayer();
          return;
        }
      }

      if (meteor.y - meteor.r > view.h + 40) meteors.splice(i, 1);
    }
  }

  function updateSpawning(dt) {
    state.spawnTimer -= dt;
    if (state.spawnTimer > 0) return;

    const wave = state.wave;
    const roll = Math.random();
    const type = roll < 0.55 ? 'large' : roll < 0.82 ? 'medium' : 'small';
    spawnMeteor(type);

    if (wave >= 4 && Math.random() < Math.min(0.4, 0.06 + wave * 0.025)) {
      spawnMeteor(Math.random() < 0.6 ? 'medium' : 'small');
    }
    if (wave >= 7 && Math.random() < 0.12) spawnMeteor('small');

    const base = clamp(1.7 - (wave - 1) * 0.09, 0.55, 1.7);
    const sizePenalty = view.w < 620 ? 1.25 : 1;
    state.spawnTimer = base * sizePenalty * rand(0.85, 1.35);
  }

  function updateAmbient(dt) {
    state.ambientTimer -= dt;
    if (state.ambientTimer > 0) return;
    state.ambientTimer = rand(1.2, 2.8);
    if (meteors.length >= 6) return;
    spawnMeteor(
      Math.random() < 0.6 ? 'small' : 'medium',
      rand(view.w * 0.1, view.w * 0.9),
      -40,
      rand(-30, 30),
      rand(18, 42)
    );
  }

  /* ------------------------------------------------------------- bullets */

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const bullet = bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;

      if (bullet.y < -30 || bullet.life <= 0 || bullet.x < -30 || bullet.x > view.w + 30) {
        bullets.splice(i, 1);
        continue;
      }

      if (state.mode !== 'playing') continue;

      for (let j = meteors.length - 1; j >= 0; j -= 1) {
        const meteor = meteors[j];
        const reach = meteor.r * 0.92 + 5;
        if (dist(bullet.x, bullet.y, meteor.x, meteor.y) < reach) {
          bullets.splice(i, 1);
          destroyMeteor(j);
          break;
        }
      }
    }
  }

  /* ------------------------------------------------------------- effects */

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const damping = Math.exp(-particle.drag * dt);
      particle.vx *= damping;
      particle.vy = particle.vy * damping + particle.gravity * dt;
    }
  }

  function updateRings(dt) {
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      const ring = rings[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      ring.r += ring.speed * dt;
      ring.speed *= Math.exp(-1.8 * dt);
    }
  }

  function updateTexts(dt) {
    for (let i = texts.length - 1; i >= 0; i -= 1) {
      const text = texts[i];
      text.life -= dt;
      if (text.life <= 0) {
        texts.splice(i, 1);
        continue;
      }
      text.y += text.vy * dt;
    }
  }

  function updateStars(dt) {
    for (const star of stars) {
      star.y += (16 + star.z * 78) * dt;
      star.tw += dt * (1 + star.z);
      if (star.y > view.h + 4) {
        star.y = -4;
        star.x = Math.random() * view.w;
      }
    }
  }

  /* --------------------------------------------------------------- waves */

  function updateDifficulty() {
    const nextWave = 1 + Math.floor(state.elapsed / WAVE_DURATION);
    if (nextWave !== state.wave) {
      state.wave = nextWave;
      announceWave();
      Sound.wave();
    }
  }

  /* -------------------------------------------------------------- update */

  function update(dt) {
    if (state.mode === 'paused') return;

    state.time += dt;
    updateStars(dt);
    updateParticles(dt);
    updateRings(dt);
    updateTexts(dt);

    state.shake = Math.max(0, state.shake - 60 * dt);
    state.flash = Math.max(0, state.flash - 2.4 * dt);

    if (state.mode === 'playing') {
      state.elapsed += dt;
      updateDifficulty();
      updatePlayer(dt);
      updateBullets(dt);
      updateMeteors(dt);
      updateSpawning(dt);

      if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) resetCombo();
      }
    } else if (state.mode === 'dying') {
      updateBullets(dt);
      updateMeteors(dt);
      state.deathTimer -= dt;
      if (state.deathTimer <= 0) showGameOver();
    } else if (state.mode === 'over') {
      updateBullets(dt);
      updateMeteors(dt);
      updateAmbient(dt);
    } else if (state.mode === 'ready') {
      updateAmbient(dt);
      updateMeteors(dt);
    }

    syncHud();
  }

  /* -------------------------------------------------------------- render */

  function drawStars() {
    for (const star of stars) {
      const alpha = (0.18 + star.z * 0.68) * (0.72 + 0.28 * Math.sin(star.tw * 2));
      ctx.fillStyle = star.tint
        ? `rgba(170, 235, 255, ${alpha})`
        : `rgba(232, 244, 255, ${alpha})`;
      const size = star.z * 1.8 + 0.4;
      ctx.fillRect(star.x, star.y, size, size + star.z * 2.4);
    }
  }

  function drawMeteors() {
    for (const meteor of meteors) {
      ctx.save();
      ctx.translate(meteor.x, meteor.y);
      ctx.rotate(meteor.rot);

      const halo = ctx.createRadialGradient(0, 0, meteor.r * 0.5, 0, 0, meteor.r * 1.75);
      halo.addColorStop(0, 'rgba(255, 132, 72, 0.26)');
      halo.addColorStop(1, 'rgba(255, 132, 72, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, meteor.r * 1.75, 0, TAU);
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < meteor.shape.length; i += 1) {
        const point = meteor.shape[i];
        const px = Math.cos(point.a) * meteor.r * point.r;
        const py = Math.sin(point.a) * meteor.r * point.r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      const rock = ctx.createRadialGradient(
        -meteor.r * 0.35,
        -meteor.r * 0.4,
        meteor.r * 0.08,
        0,
        0,
        meteor.r * 1.25
      );
      rock.addColorStop(0, '#a89080');
      rock.addColorStop(0.45, '#665148');
      rock.addColorStop(1, '#291f1b');
      ctx.fillStyle = rock;
      ctx.shadowColor = 'rgba(255, 120, 60, 0.5)';
      ctx.shadowBlur = 22;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(255, 163, 104, 0.48)';
      ctx.lineWidth = Math.max(1, meteor.r * 0.05);
      ctx.stroke();

      ctx.fillStyle = 'rgba(22, 15, 13, 0.42)';
      for (const crater of meteor.craters) {
        ctx.beginPath();
        ctx.arc(crater.x * meteor.r, crater.y * meteor.r, crater.r * meteor.r, 0, TAU);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function drawBullets() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const bullet of bullets) {
      const trail = ctx.createLinearGradient(bullet.x, bullet.y - 20, bullet.x, bullet.y + 6);
      trail.addColorStop(0, 'rgba(93, 242, 255, 0)');
      trail.addColorStop(0.55, 'rgba(160, 250, 255, 0.95)');
      trail.addColorStop(1, 'rgba(255, 236, 180, 0.95)');
      ctx.strokeStyle = trail;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bullet.x, bullet.y - 20);
      ctx.lineTo(bullet.x, bullet.y + 4);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y + 2, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of particles) {
      const ratio = Math.max(0, particle.life / particle.max);
      ctx.globalAlpha = Math.min(1, ratio * 1.4);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.35 + ratio * 0.75), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRings() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const ring of rings) {
      const ratio = Math.max(0, ring.life / ring.max);
      ctx.globalAlpha = ratio * 0.8;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2 + ratio * 3;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTexts() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const text of texts) {
      const ratio = Math.max(0, text.life / text.max);
      ctx.globalAlpha = Math.min(1, ratio * 2.4);
      ctx.font = `700 ${text.size}px ${FONT_DISPLAY}`;
      ctx.fillStyle = text.color;
      ctx.shadowColor = text.color;
      ctx.shadowBlur = 16;
      ctx.fillText(text.text, text.x, text.y);
    }
    ctx.restore();
  }

  function drawPlayer() {
    const player = state.player;
    if (!player || !player.alive) return;

    const blinking = player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.bank);

    if (blinking) ctx.globalAlpha = 0.42;

    const flicker = 0.75 + Math.random() * 0.5;
    const flameLength = 16 + player.thrust * 18;
    const flame = ctx.createLinearGradient(0, 12, 0, 12 + flameLength * flicker);
    flame.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    flame.addColorStop(0.4, 'rgba(120, 245, 255, 0.8)');
    flame.addColorStop(1, 'rgba(93, 242, 255, 0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-5, 12);
    ctx.quadraticCurveTo(0, 14 + flameLength * flicker, 5, 12);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'rgba(93, 242, 255, 0.85)';
    ctx.shadowBlur = 20;

    ctx.fillStyle = '#ff4f9a';
    ctx.beginPath();
    ctx.moveTo(-8, 4);
    ctx.lineTo(-19, 20);
    ctx.lineTo(-7, 17);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 4);
    ctx.lineTo(19, 20);
    ctx.lineTo(7, 17);
    ctx.closePath();
    ctx.fill();

    const hull = ctx.createLinearGradient(-12, 0, 12, 0);
    hull.addColorStop(0, '#7fa6b5');
    hull.addColorStop(0.4, '#f2feff');
    hull.addColorStop(0.72, '#c9e9f3');
    hull.addColorStop(1, '#5f8391');
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(0, -27);
    ctx.quadraticCurveTo(8.5, -12, 9.5, 8);
    ctx.lineTo(7, 16);
    ctx.lineTo(-7, 16);
    ctx.lineTo(-9.5, 8);
    ctx.quadraticCurveTo(-8.5, -12, 0, -27);
    ctx.closePath();
    ctx.fill();

    const glass = ctx.createLinearGradient(0, -15, 0, 4);
    glass.addColorStop(0, '#e8fdff');
    glass.addColorStop(0.45, '#5df2ff');
    glass.addColorStop(1, '#0a4a63');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.ellipse(0, -7, 4.2, 8, 0, 0, TAU);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();

    if (player.invuln > 0) {
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.14 * Math.sin(state.time * 12);
      ctx.strokeStyle = '#7df6ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 33, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function render() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.drawImage(background, 0, 0, view.w, view.h);

    const shakeX = state.shake > 0 ? rand(-1, 1) * state.shake : 0;
    const shakeY = state.shake > 0 ? rand(-1, 1) * state.shake : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawStars();
    drawMeteors();
    drawBullets();
    drawRings();
    drawParticles();
    drawPlayer();
    drawTexts();

    ctx.restore();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 88, 104, ${state.flash * 0.5})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  /* ----------------------------------------------------------------- HUD */

  const hudCache = { score: -1, best: -1, wave: -1, lives: -1, multiplier: -1 };

  function initLives() {
    el.lives.innerHTML = '';
    for (let i = 0; i < MAX_LIVES; i += 1) {
      const life = document.createElement('span');
      life.className = 'life';
      life.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2c2.4 2.5 3.6 5.6 3.6 8.6l3.4 4.4-4.2-.8-1 3.4-1.8-2.7-1.8 2.7-1-3.4-4.2.8 3.4-4.4c0-3 1.2-6.1 3.6-8.6Z"/></svg>';
      el.lives.appendChild(life);
    }
  }

  function syncHud(force = false) {
    if (force || state.score !== hudCache.score) {
      hudCache.score = state.score;
      el.score.textContent = state.score.toLocaleString();
    }
    if (force || state.best !== hudCache.best) {
      hudCache.best = state.best;
      el.best.textContent = state.best.toLocaleString();
      el.startBest.textContent = state.best.toLocaleString();
    }
    if (force || state.wave !== hudCache.wave) {
      hudCache.wave = state.wave;
      el.wave.textContent = state.wave;
    }
    if (force || state.lives !== hudCache.lives) {
      hudCache.lives = state.lives;
      Array.from(el.lives.children).forEach((node, index) => {
        node.classList.toggle('lost', index >= state.lives);
      });
    }

    const multiplier = comboMultiplier();
    if (force || multiplier !== hudCache.multiplier) {
      hudCache.multiplier = multiplier;
      el.combo.textContent = `\u00d7${multiplier}`;
      el.combo.classList.toggle('is-active', multiplier > 1);
      if (!force && multiplier > 1) {
        el.combo.classList.remove('pop');
        void el.combo.offsetWidth;
        el.combo.classList.add('pop');
      }
    }
  }

  function syncSoundButton() {
    el.soundButton.classList.toggle('muted', Sound.muted);
    el.soundButton.setAttribute('aria-pressed', String(Sound.muted));
    el.soundButton.title = Sound.muted ? 'Sound off (M)' : 'Sound on (M)';
  }

  /* ----------------------------------------------------------- game flow */

  function resetWorld() {
    meteors.length = 0;
    bullets.length = 0;
    particles.length = 0;
    rings.length = 0;
    texts.length = 0;

    state.elapsed = 0;
    state.wave = 1;
    state.score = 0;
    state.lives = MAX_LIVES;
    state.combo = 0;
    state.comboTimer = 0;
    state.spawnTimer = 1.5;
    state.ambientTimer = 1.5;
    state.trailTimer = 0;
    state.deathTimer = 0;
    state.shake = 0;
    state.flash = 0;
    state.player = createPlayer();
  }

  function startGame() {
    Sound.unlock();
    resetWorld();
    state.mode = 'playing';

    hideOverlay(el.startOverlay);
    hideOverlay(el.overOverlay);
    hideOverlay(el.pauseOverlay);
    el.hint.classList.add('dim');

    announceWave();
    syncHud(true);
    lastTime = performance.now();

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function showGameOver() {
    state.mode = 'over';

    const record = state.score > 0 && state.score > state.best;
    if (record) {
      state.best = state.score;
      storage.set(BEST_KEY, state.best);
    }

    el.finalScore.textContent = state.score.toLocaleString();
    el.finalBest.textContent = state.best.toLocaleString();
    el.finalWave.textContent = state.wave;
    el.newRecord.classList.toggle('is-hidden', !record);

    el.hint.classList.remove('dim');
    showOverlay(el.overOverlay);
    syncHud(true);
  }

  function pauseGame() {
    if (state.mode !== 'playing') return;
    state.mode = 'paused';
    keys.up = keys.down = keys.left = keys.right = keys.fire = false;
    pointer.active = false;
    showOverlay(el.pauseOverlay);
  }

  function resumeGame() {
    if (state.mode !== 'paused') return;
    state.mode = 'playing';
    hideOverlay(el.pauseOverlay);
    lastTime = performance.now();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function togglePause() {
    if (state.mode === 'playing') pauseGame();
    else if (state.mode === 'paused') resumeGame();
  }

  function toggleSound() {
    Sound.toggle();
    syncSoundButton();
    storage.set(MUTE_KEY, Sound.muted ? '1' : '0');
    if (!Sound.muted) {
      Sound.unlock();
      Sound.ui();
    }
  }

  /* -------------------------------------------------------------- input */

  const KEY_ACTIONS = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    Space: 'fire',
  };

  const KEY_ACTIONS_BY_KEY = {
    arrowleft: 'left',
    a: 'left',
    arrowright: 'right',
    d: 'right',
    arrowup: 'up',
    w: 'up',
    arrowdown: 'down',
    s: 'down',
    ' ': 'fire',
    spacebar: 'fire',
  };

  const actionFor = (event) =>
    KEY_ACTIONS[event.code] || KEY_ACTIONS_BY_KEY[(event.key || '').toLowerCase()] || null;

  window.addEventListener('keydown', (event) => {
    const action = actionFor(event);
    if (action) {
      event.preventDefault();
      keys[action] = true;
      Sound.unlock();
    }

    if (event.repeat) return;

    const key = (event.key || '').toLowerCase();

    if (event.code === 'KeyP' || event.code === 'Escape' || key === 'p' || key === 'escape') {
      event.preventDefault();
      togglePause();
    } else if (event.code === 'KeyR' || key === 'r') {
      if (state.mode !== 'ready') startGame();
    } else if (event.code === 'KeyM' || key === 'm') {
      toggleSound();
    } else if (event.code === 'Enter' || key === 'enter') {
      if (state.mode === 'ready' || state.mode === 'over') startGame();
      else if (state.mode === 'paused') resumeGame();
    }
  });

  window.addEventListener('keyup', (event) => {
    const action = actionFor(event);
    if (action) {
      event.preventDefault();
      keys[action] = false;
    }
  });

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = clamp(event.clientX - rect.left, 26, view.w - 26);
    pointer.y = clamp(event.clientY - rect.top - 54, 72, view.h - BOTTOM_MARGIN);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'playing') return;
    event.preventDefault();
    Sound.unlock();
    pointer.active = true;
    pointer.id = event.pointerId;
    updatePointer(event);
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        /* ignore */
      }
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointer.active || event.pointerId !== pointer.id) return;
    updatePointer(event);
  });

  function endPointer(event) {
    if (event.pointerId !== pointer.id) return;
    pointer.active = false;
    pointer.id = null;
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  /* ------------------------------------------------------------- buttons */

  el.startButton.addEventListener('click', () => {
    Sound.ui();
    startGame();
  });
  el.restartButton.addEventListener('click', () => {
    Sound.ui();
    startGame();
  });
  el.resumeButton.addEventListener('click', resumeGame);
  el.pauseRestartButton.addEventListener('click', () => {
    Sound.ui();
    startGame();
  });
  el.soundButton.addEventListener('click', toggleSound);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  window.addEventListener('blur', pauseGame);

  /* ---------------------------------------------------------------- loop */

  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  /* ----------------------------------------------------------------- init */

  initLives();
  resize();
  syncHud(true);
  syncSoundButton();
  requestAnimationFrame(loop);
})();
