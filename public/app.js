/* Snek — dependency-free Snake PWA game */
(() => {
  "use strict";

  const GRID = 20;
  const BASE_TICK = 150; // ms per step at level 1
  const MIN_TICK = 70;
  const STORAGE_KEY = "snek-highscore";
  const SOUND_KEY = "snek-sound";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const startBtn = document.getElementById("startBtn");
  const soundBtn = document.getElementById("soundBtn");
  const installBtn = document.getElementById("installBtn");

  const CELL = canvas.width / GRID;
  const UP = { x: 0, y: -1 };
  const DOWN = { x: 0, y: 1 };
  const LEFT = { x: -1, y: 0 };
  const RIGHT = { x: 1, y: 0 };
  const DIRS = { up: UP, down: DOWN, left: LEFT, right: RIGHT };
  const OPPOSITE = { up: DOWN, down: UP, left: RIGHT, right: LEFT };

  let snake;
  let dir;
  let pendingDir;
  let food;
  let score;
  let best = readNumber(STORAGE_KEY, 0);
  let tick = BASE_TICK;
  let dying = false;
  let state = "menu"; // menu | playing | paused | over
  let loopTimer = 0;
  let lastStep = 0;
  let sound = readBool(SOUND_KEY, true);

  let deferredPrompt = null;
  let audioCtx = null;

  /* ---------------------------------------------------------------- setup */

  function readNumber(key, fallback) {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  }

  function readBool(key, fallback) {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  }

  bestEl.textContent = best;
  soundBtn.textContent = sound ? "🔊" : "🔇";
  startBtn.textContent = "▶ Play";

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const size = Math.max(1, Math.round(rect.width * dpr));
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
  }

  function reset() {
    snake = [
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
    ];
    dir = RIGHT;
    pendingDir = RIGHT;
    score = 0;
    tick = BASE_TICK;
    dying = false;
    scoreEl.textContent = "0";
    placeFood();
  }

  function placeFood() {
    const free = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    food = free[Math.floor(Math.random() * free.length)] || { x: 0, y: 0 };
  }

  function setDir(name) {
    if (!DIRS[name] || state !== "playing" || dying) return;
    const next = DIRS[name];
    if (next.x === -dir.x && next.y === -dir.y) return; // no reversing
    pendingDir = next;
  }

  function startGame() {
    reset();
    state = "playing";
    lastStep = performance.now();
    hideOverlay();
    draw();
    beep(660, 0.06, "square", 0.05);
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      showOverlay("paused", "Take a breath. Press Space to keep going.", "▶ Resume");
    } else if (state === "paused") {
      state = "playing";
      lastStep = performance.now();
      hideOverlay();
      draw();
    }
  }

  function gameOver() {
    state = "over";
    if (score > best) {
      best = score;
      localStorage.setItem(STORAGE_KEY, String(best));
      bestEl.textContent = best;
    }
    beep(160, 0.35, "sawtooth", 0.06);
    setTimeout(() => {
      if (state === "over") {
        showOverlay("game over", `You scored ${score}. Best: ${best}`, "↻ Play again");
      }
    }, 300);
  }

  function showOverlay(title, text, buttonLabel) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startBtn.textContent = buttonLabel;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  /* --------------------------------------------------------------- input */

  document.addEventListener("keydown", (e) => {
    const key = e.key;
    if (key.startsWith("Arrow") || ["w", "W", "a", "A", "s", "S", "d", "D"].includes(key)) {
      e.preventDefault();
      const map = {
        ArrowUp: "up", w: "up", W: "up",
        ArrowDown: "down", s: "down", S: "down",
        ArrowLeft: "left", a: "left", A: "left",
        ArrowRight: "right", d: "right", D: "right",
      };
      if (state === "menu" || state === "over") startGame();
      else setDir(map[key]);
    } else if (key === " " || key === "Escape" || key === "p" || key === "P") {
      e.preventDefault();
      if (state === "playing" || state === "paused") togglePause();
      else if (state !== "menu") startGame();
    } else if (key === "Enter") {
      if (state !== "playing") startGame();
    }
  });

  startBtn.addEventListener("click", () => {
    if (state === "paused") togglePause();
    else startGame();
  });

  soundBtn.addEventListener("click", () => {
    sound = !sound;
    localStorage.setItem(SOUND_KEY, sound ? "1" : "0");
    soundBtn.textContent = sound ? "🔊" : "🔇";
  });

  /* Touch swipe --------------------------------------------------------- */
  let touchStart = null;
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
        if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? "right" : "left");
        else setDir(dy > 0 ? "down" : "up");
        touchStart = null; // one swipe = one turn
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      touchStart = null;
    },
    { passive: false }
  );

  /* On-screen pad ------------------------------------------------------- */
  document.querySelectorAll(".pad-btn").forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const d = btn.dataset.dir;
      if (d === "pause") togglePause();
      else if (state === "menu" || state === "over") startGame();
      else setDir(d);
    });
  });

  /* ------------------------------------------------------------ install */

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") installBtn.hidden = true;
    deferredPrompt = null;
  });

  window.addEventListener("appinstalled", () => {
    installBtn.hidden = true;
  });

  /* ----------------------------------------------------------- game loop */

  function step(now) {
    if (state !== "playing") return;
    const interval = Math.max(MIN_TICK, tick - Math.floor(score / 5) * 8);
    if (now - lastStep < interval) return;
    lastStep = now;

    dir = pendingDir;
    const head = snake[0];
    const next = {
      x: (head.x + dir.x + GRID) % GRID,
      y: (head.y + dir.y + GRID) % GRID,
    };

    const willEat = next.x === food.x && next.y === food.y;

    // Wall wrap: only head matters; body collision with a wall would self-collide anyway.
    if (!willEat && snake.some((s, i) => i < snake.length - 1 && s.x === next.x && s.y === next.y)) {
      dying = true;
      gameOver();
      draw();
      return;
    }

    const body = snake.map((s) => ({ ...s }));
    body.unshift(next);
    if (!willEat) body.pop();

    snake = body;

    if (willEat) {
      score += 1;
      scoreEl.textContent = score;
      tick = BASE_TICK;
      beep(660, 0.06, "square", 0.05);
      placeFood();
    }

    draw();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    step(now);
  }

  /* ---------------------------------------------------------------- draw */

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    const size = canvas.width;
    const c = size / GRID;
    ctx.clearRect(0, 0, size, size);

    // Board background + checker
    ctx.fillStyle = "#060a12";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * c, y * c, c, c);
      }
    }

    // Food (apple)
    if (food) {
      const fx = (food.x + 0.5) * c;
      const fy = (food.y + 0.5) * c;
      const r = c * 0.36;
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(fx, fy + 1, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fca5a5";
      ctx.beginPath();
      ctx.arc(fx - r * 0.32, fy - r * 0.32, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7c2d12";
      ctx.lineWidth = Math.max(1, c * 0.09);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(fx, fy - r + 1);
      ctx.lineTo(fx + c * 0.1, fy - r - c * 0.1);
      ctx.stroke();
    }

    // Snake body — rounded segments, darkest tail to brighter head
    const n = snake.length;
    for (let i = n - 1; i >= 0; i--) {
      const s = snake[i];
      const t = 1 - i / Math.max(1, n);
      const brightness = 0.65 + t * 0.35;
      const main = `rgb(${Math.round(22 * brightness)}, ${Math.round(163 * brightness)}, ${Math.round(74 * brightness)})`;
      const glow = i === 0;
      ctx.fillStyle = main;
      if (glow) {
        ctx.shadowColor = "rgba(34,197,94,0.9)";
        ctx.shadowBlur = size * 0.02;
      }
      const pad = c * 0.07;
      roundRectPath(s.x * c + pad, s.y * c + pad, c - 2 * pad, c - 2 * pad, c * 0.25);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Eyes on head
    const head = snake[0];
    const hx = (head.x + 0.5) * c;
    const hy = (head.y + 0.5) * c;
    const eyeR = c * 0.12;
    for (const side of [-1, 1]) {
      const ex = hx + dir.x * c * 0.24 + side * avgPerp(dir).x * c * 0.22;
      const ey = hy + dir.y * c * 0.24 + side * avgPerp(dir).y * c * 0.22;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(ex + dir.x * eyeR * 0.35, ey + dir.y * eyeR * 0.35, eyeR * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * c, 0);
      ctx.lineTo(i * c, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * c);
      ctx.lineTo(size, i * c);
      ctx.stroke();
    }
  }

  const avgPerp = (d) => ({ x: d.y, y: d.x });

  /* ----------------------------------------------------------------- sound */

  function beep(freq, dur, type = "square", vol = 0.05) {
    if (!sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (_) {
      /* audio unsupported */
    }
  }

  /* ------------------------------------------------------------- init */

  reset();
  draw();
  fitCanvas();
  window.addEventListener("resize", () => {
    fitCanvas();
    draw();
  });
  requestAnimationFrame(loop);

  // Service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
})();
