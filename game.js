import {
  W,
  R,
  clamp,
  generate,
  circleRect,
  reflect,
  layout,
  levelRecipe,
  nextLevelIdentity,
  brickRect,
} from "./engine.js";
import { SETTINGS_KEY, readProgress, writeProgress } from "./storage.js";
import { canPause, viewportStyle, repositionBall } from "./recovery.js";
const $ = (id) => document.getElementById(id),
  canvas = $("game"),
  ctx = canvas.getContext("2d"),
  arena = $("arena"),
  overlay = $("overlay"),
  card = $("card"),
  SETTINGS = SETTINGS_KEY;
let H = 800,
  mode = "menu",
  state,
  balls = [],
  drops = [],
  particles = [],
  paddle = 300,
  target = 300,
  width = 132,
  effects = {},
  last = 0,
  acc = 0,
  lastSave = 0,
  toastUntil = 0,
  countUntil = 0,
  keys = {},
  pointer = null,
  saved = null,
  settings = {
    slow: true,
    sound: false,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  },
  audio,
  storageOK = true,
  lastHit = 0,
  zoomed = false,
  fitted = false;
try {
  const value = JSON.parse(localStorage.getItem(SETTINGS) || "{}");
  for (const key of ["slow", "sound", "reduced"])
    if (typeof value?.[key] === "boolean") settings[key] = value[key];
} catch {
  /* A broken settings entry must not hide a valid saved game. */
}
try {
  ({ saved, available: storageOK } = readProgress(localStorage));
} catch {
  storageOK = false;
}
function makeState(level = 1, seed = Date.now() >>> 0, score = 0, lives = 3) {
  return {
    version: 1,
    level,
    seed,
    score,
    lives,
    bricks: generate(
      level,
      seed,
      clamp(Math.floor(arena.clientWidth / 56), 5, 10),
    ),
  };
}
state = saved ? structuredClone(saved) : makeState();
function persist() {
  // Keep the current run in memory even if Safari refuses storage writes.
  saved = structuredClone(state);
  try {
    storageOK = writeProgress(localStorage, state);
  } catch {
    storageOK = false;
  }
  $("footer-status").textContent = storageOK
    ? "Your place is saved."
    : "Saving unavailable. Keep this tab open.";
  $("save-note").textContent = storageOK
    ? "Your place is saved on this device."
    : "Saving unavailable. Keep this tab open.";
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(settings));
  } catch {}
  updateSound();
}
function updateSound() {
  $("sound").textContent = settings.sound ? "Sound on" : "Sound off";
  $("sound").setAttribute("aria-pressed", settings.sound);
}
function beep(freq = 450) {
  if (!settings.sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.035, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.12);
  } catch {}
}
function art() {
  return (
    '<div class="card-art" aria-hidden="true">' + "<i></i>".repeat(9) + "</div>"
  );
}
function dialog(html) {
  overlay.hidden = false;
  card.innerHTML =
    html +
    (!storageOK
      ? '<p class="storage-warning" role="status">This browser can’t save your game. Keep this page open to keep your place.</p>'
      : "");
  card.scrollTop = 0;
  syncModal();
  requestAnimationFrame(() => card.focus({ preventScroll: true }));
}
const modalBackground = [
  document.querySelector(".masthead"),
  document.querySelector(".sidebar"),
  document.querySelector(".scorebar"),
  document.querySelector(".game-footer"),
  document.querySelector(".page-footer"),
];
function syncModal() {
  const blocked = !overlay.hidden || !$("recovery").hidden;
  overlay.inert = !$("recovery").hidden;
  document.body.classList.toggle("dialog-open", blocked);
  modalBackground.forEach((el) => {
    el.inert = blocked;
    el.toggleAttribute("inert", blocked);
    el.setAttribute("aria-hidden", String(blocked));
    el.querySelectorAll("button").forEach(
      (b) => (b.disabled = blocked || (b.id === "pause" && mode === "menu")),
    );
  });
}
new MutationObserver(syncModal).observe(overlay, {
  attributes: true,
  attributeFilter: ["hidden"],
});
new MutationObserver(syncModal).observe($("recovery"), {
  attributes: true,
  attributeFilter: ["hidden"],
});
function button(id, text, cls = "primary") {
  return `<button id="${id}" class="${cls}">${text}</button>`;
}
function bind(id, fn) {
  $(id)?.addEventListener("click", fn);
}
function home() {
  mode = "menu";
  dialog(
    `${art()}<span class="eyebrow">ONE BRICK AT A TIME</span><h2>A little time<br>just for you.</h2><p>Slide the paddle. Bounce the ball.<br>Enjoy a little break.</p>${button("play", saved ? "Keep playing" : "Let’s play")}${saved ? `<p class="small">Your place: level ${saved.level}</p>${button("new", "Start a new game", "text-button")}` : '<p class="small">No timer. No hurry. You’ve got this.</p>'}${button("home-comfort", "Comfort & settings", "text-button")}`,
  );
  bind("home-comfort", () => comfort("menu"));
  bind("play", () => {
    state = saved ? structuredClone(saved) : makeState();
    if (state.lives <= 0) state.lives = 3;
    resetRound();
    prepare();
  });
  bind("new", confirmNew);
  updateHUD();
}
function confirmNew() {
  dialog(
    `<span class="eyebrow">A FRESH START</span><h2>Start from level 1?</h2><p>This replaces your saved game.</p>${button("cancel-new", "Keep my game")}${button("confirm-new", "Start again", "secondary")}`,
  );
  bind("cancel-new", home);
  bind("confirm-new", () => {
    state = makeState();
    resetRound();
    persist();
    prepare();
  });
}
function resetRound() {
  balls = [];
  drops = [];
  particles = [];
  effects = {};
  paddle = target = 300;
  width = 132;
  lastHit = performance.now();
}
function prepare() {
  mode = "ready";
  updateHUD();
  const level = state.level;
  dialog(
    `<span class="eyebrow">LEVEL ${String(level).padStart(2, "0")}</span><h2>${level === 1 ? "Let’s take it easy." : "Ready when you are."}</h2><p>${level === 1 ? "Slide one finger left and right<br>to move the paddle." : level === 3 ? "The marked core breaks nearby bricks.<br>Hit it twice to open it." : level === 4 ? "Striped bricks stay in place.<br>Bounce around them." : "Clear the colorful bricks.<br>Take your time."}</p>${button("launch", "Start playing")}<p class="small">${level === 1 ? "On a computer? Use your mouse or arrow keys." : "You can pause whenever you like."}</p>`,
  );
  bind("launch", () => {
    overlay.hidden = true;
    syncModal();
    mode = "playing";
    launch();
    persist();
  });
}
function field() {
  return layout(H);
}
function brickY(b) {
  return brickRect(b, H).y;
}
function brickHeight(b) {
  return brickRect(b, H).h;
}
function launch() {
  const speed = ballSpeed();
  balls = [
    { x: paddle, y: field().paddleY - 12, vx: speed * 0.3, vy: -speed * 0.954 },
  ];
  beep(520);
  lastHit = performance.now();
}
function ballSpeed() {
  return (settings.slow ? 205 : 270) + Math.min(85, (state.level - 1) * 4);
}
function pause(reason = "Take a little breather.") {
  if (!canPause(mode)) return;
  mode = "paused";
  keys = {};
  pointer = null;
  persist();
  dialog(
    `<span class="eyebrow">PAUSED · LEVEL ${state.level}</span><h2>${reason}</h2><p>Your game is safe.<br>We’ll carry on when you’re ready.</p>${button("resume", "Keep playing")}${button("comfort", "Comfort & settings", "secondary")}${button("menu", "Back to start", "text-button")}`,
  );
  bind("resume", resume);
  bind("comfort", () => comfort("paused"));
  bind("menu", home);
}
function resume() {
  if (zoomed || mode !== "paused") return;
  if (!balls.length) {
    prepare();
    return;
  }
  overlay.hidden = true;
  syncModal();
  countUntil = performance.now() + 2400;
  mode = "countdown";
  lastHit = performance.now();
}
function notify(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  toastUntil = performance.now() + 2500;
}
function updateHUD() {
  $("level").textContent = String(state.level).padStart(2, "0");
  $("score").textContent = String(state.score).padStart(4, "0");
  $("lives").textContent =
    "● ".repeat(state.lives) + "○ ".repeat(3 - Math.min(3, state.lives));
  $("lives").setAttribute("aria-label", `${state.lives} chances`);
  $("field-name").textContent = levelRecipe(
    state.level,
    state.seed,
  ).name.toUpperCase();
  const n = state.bricks.filter((b) => b.type !== "solid" && b.hp > 0).length;
  $("remaining").textContent = `${n} BRICKS`;
  $("pause").disabled = mode === "menu";
}
function comfort(from = mode) {
  if (mode === "playing" || mode === "countdown") {
    pause();
    from = "paused";
  }
  dialog(
    `<span class="eyebrow">MAKE YOURSELF COMFORTABLE</span><h2>Your kind of pace.</h2><label for="slow">Slower ball<input id="slow" type="checkbox" ${settings.slow ? "checked" : ""}></label><label for="sounds">Gentle sounds<input id="sounds" type="checkbox" ${settings.sound ? "checked" : ""}></label><label for="reduced">Fewer moving effects<input id="reduced" type="checkbox" ${settings.reduced ? "checked" : ""}></label><p class="small">On iPhone, use Share → Add to Home Screen for more room to play.</p>${button("done", "All done")}`,
  );
  bind("done", () => {
    const wasSlow = settings.slow;
    settings.slow = $("slow").checked;
    settings.sound = $("sounds").checked;
    settings.reduced = $("reduced").checked;
    if (wasSlow !== settings.slow) {
      const ratio = settings.slow ? 0.76 : 1 / 0.76;
      balls.forEach((b) => {
        b.vx *= ratio;
        b.vy *= ratio;
      });
    }
    saveSettings();
    if (from === "menu") home();
    else if (from === "ready") prepare();
    else {
      mode = "playing";
      pause();
    }
  });
}
function help() {
  const from = mode;
  if (["playing", "countdown"].includes(mode)) pause();
  dialog(
    `<span class="eyebrow">YOU’LL GET THE HANG OF IT</span><h2>One bounce at a time.</h2><p><strong>1.</strong> Slide one finger left and right.<br><strong>2.</strong> Keep the ball on the paddle.<br><strong>3.</strong> Clear the colorful bricks.</p><p class="small">Catch falling bonuses for a helping hand. Striped bricks stay put. Bricks with dots need extra hits.</p>${button("help-done", "Got it")}`,
  );
  bind("help-done", () => {
    if (from === "menu") home();
    else if (from === "ready") prepare();
    else {
      mode = "playing";
      pause();
    }
  });
}
function lose() {
  state.lives--;
  resetRound();
  persist();
  updateHUD();
  mode = "waiting";
  dialog(
    `<span class="eyebrow">${state.lives ? "A LITTLE RESET" : "NO WORRIES"}</span><h2>${state.lives ? "Let’s try that again." : "Another go?"}</h2><p>${state.lives ? "The bricks you cleared stay cleared." : "Keep going from this level.<br>We’ll give you three fresh chances."}</p>${button("retry", state.lives ? "Try again" : "Try this level again")}${button("end-menu", "Back to start", "text-button")}`,
  );
  bind("retry", () => {
    if (state.lives <= 0) state.lives = 3;
    persist();
    prepare();
  });
  bind("end-menu", home);
}
function nextLevel() {
  mode = "waiting";
  resetRound();
  const clearedLevel = state.level;
  Object.assign(state, nextLevelIdentity(state.level, state.seed));
  state.lives = Math.min(3, state.lives + 1);
  state.bricks = generate(
    state.level,
    state.seed,
    clamp(Math.floor(arena.clientWidth / 56), 5, 10),
  );
  persist();
  updateHUD();
  beep(800);
  dialog(
    `${art()}<span class="eyebrow">BEAUTIFULLY DONE</span><h2>A lovely little win.</h2><p>Level ${clearedLevel} is clear.<br>Your next level is ready.</p>${button("next", "Play level " + state.level)}${button("rest", "Take a break", "secondary")}<p class="small">Your progress is saved. Come back anytime.</p>`,
  );
  bind("next", prepare);
  bind("rest", home);
}
function hitBrick(brick) {
  if (brick.type === "solid") {
    beep(200);
    return;
  }
  brick.hp--;
  state.score += 10;
  lastHit = performance.now();
  beep(420 + brick.color * 100);
  if (brick.hp === 0) {
    state.score += 20;
    burst(
      brick.x + brick.w / 2,
      brickY(brick) + brickHeight(brick) / 2,
      brick.color,
    );
    if (brick.drop)
      drops.push({
        x: brick.x + brick.w / 2,
        y: brickY(brick),
        type: brick.drop,
      });
    if (brick.type === "core") {
      notify("A little chain reaction!");
      for (const b of state.bricks) {
        if (
          b !== brick &&
          b.type !== "solid" &&
          b.hp > 0 &&
          Math.hypot((b.x - brick.x) / 80, (b.y - brick.y) / 0.06) < 1.9
        ) {
          b.hp = 0;
          state.score += 30;
          burst(b.x + b.w / 2, brickY(b), b.color);
        }
      }
    }
  }
  updateHUD();
  persist();
}
function burst(x, y, color) {
  if (settings.reduced) return;
  for (let i = 0; i < 7; i++)
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 100,
      vy: (Math.random() - 0.5) * 100,
      life: 0.6,
      color,
    });
}
function power(type) {
  const now = performance.now();
  if (type === "wide") {
    effects.wide = now + 18000;
    notify("A wider paddle!");
  }
  if (type === "slow") {
    effects.slow = now + 14000;
    notify("A gentler bounce!");
  }
  if (type === "shield") {
    effects.shield = true;
    notify("A safety net for one bounce!");
  }
  if (type === "pierce") {
    effects.pierce = now + 12000;
    notify("Straight through the colorful bricks!");
  }
  if (type === "multi") {
    if (balls.length < 5) {
      const b = balls[0];
      if (b)
        for (const sign of [-1, 1]) {
          const s = Math.hypot(b.vx, b.vy);
          balls.push({ x: b.x, y: b.y, vx: sign * s * 0.6, vy: -s * 0.8 });
        }
    }
    notify("A few extra helping hands!");
  }
  if (type === "sticky") {
    effects.sticky = now + 16000;
    notify("Your next catch will wait for you!");
  }
  beep(700);
}
function update(dt, now) {
  const desired = effects.wide > now ? 180 : 132;
  width += (desired - width) * Math.min(1, dt * 12);
  paddle = clamp(
    paddle + (target - paddle) * Math.min(1, dt * 22),
    width / 2 + 8,
    W - width / 2 - 8,
  );
  if (keys.ArrowLeft) target -= dt * 420;
  if (keys.ArrowRight) target += dt * 420;
  target = clamp(target, width / 2 + 8, W - width / 2 - 8);
  const factor = effects.slow > now ? 0.72 : 1;
  for (const b of balls) {
    if (b.held) {
      b.x = paddle;
      b.y = field().paddleY - 12;
      continue;
    }
    const steps = Math.ceil((Math.hypot(b.vx, b.vy) * dt) / (R * 0.45));
    for (let step = 0; step < steps; step++) {
      b.x += ((b.vx * dt) / steps) * factor;
      b.y += ((b.vy * dt) / steps) * factor;
      if (b.x < R) {
        b.x = R;
        b.vx = Math.abs(b.vx);
      }
      if (b.x > W - R) {
        b.x = W - R;
        b.vx = -Math.abs(b.vx);
      }
      if (b.y < R + field().ceiling) {
        b.y = R + field().ceiling;
        b.vy = Math.abs(b.vy);
      }
      if (
        b.vy > 0 &&
        b.y + R >= field().paddleY &&
        b.y - R <= field().paddleY + 14 &&
        b.x >= paddle - width / 2 - R &&
        b.x <= paddle + width / 2 + R
      ) {
        b.y = field().paddleY - R;
        const angle = clamp((b.x - paddle) / (width / 2), -0.95, 0.95) * 1.06;
        const speed = Math.min(
          ballSpeed() * 1.22,
          Math.max(ballSpeed(), Math.hypot(b.vx, b.vy) * 1.008),
        );
        b.vx = Math.sin(angle) * speed;
        b.vy = -Math.cos(angle) * speed;
        if (effects.sticky > now) {
          b.held = true;
          delete effects.sticky;
          notify("Tap the game to send it off again.");
        }
        beep(320);
      }
      if (effects.shield && b.y > H - 29 && b.vy > 0) {
        b.vy = -Math.abs(b.vy);
        b.y = H - 30;
        delete effects.shield;
        notify("Caught by your safety net!");
      }
      for (const brick of state.bricks) {
        if (brick.hp <= 0) continue;
        const collision = circleRect(b, {
          x: brick.x,
          y: brickY(brick),
          w: brick.w,
          h: brickHeight(brick),
        });
        if (!collision) continue;
        if (!(effects.pierce > now && brick.type !== "solid")) {
          b.x += collision.x * (collision.depth + 0.1);
          b.y += collision.y * (collision.depth + 0.1);
          reflect(b, collision);
        }
        hitBrick(brick);
        break;
      }
    }
  }
  balls = balls.filter((b) => b.y < H + 30);
  if (!balls.length) {
    lose();
    return;
  }
  for (const d of drops) {
    d.y += dt * 100;
    if (
      d.y > field().paddleY - 21 &&
      d.y < field().paddleY + 29 &&
      Math.abs(d.x - paddle) < width / 2 + 14
    ) {
      power(d.type);
      d.y = H + 100;
    }
  }
  drops = drops.filter((d) => d.y < H + 30);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  if (!state.bricks.some((b) => b.hp > 0 && b.type !== "solid")) {
    nextLevel();
    return;
  }
  if (now - lastHit > 28000) {
    const b = balls.find((b) => !b.held),
      brick = state.bricks.find((b) => b.hp > 0 && b.type !== "solid");
    if (b && brick) {
      const dx = brick.x + brick.w / 2 - b.x,
        dy = brickY(brick) + brickHeight(brick) / 2 - b.y,
        len = Math.hypot(dx, dy),
        speed = Math.hypot(b.vx, b.vy);
      b.vx = (dx / len) * speed;
      b.vy = (dy / len) * speed;
      notify("A little nudge to help things along.");
    }
    lastHit = now;
  }
}
const palette = ["#2b9ed1", "#6ead45", "#d7a12a"];
function draw(now) {
  ctx.clearRect(0, 0, W, H);
  const py = field().paddleY;
  for (const b of state.bricks) {
    if (b.hp <= 0) continue;
    const y = brickY(b),
      h = brickHeight(b);
    ctx.fillStyle = b.type === "solid" ? "#2a313a" : palette[b.color];
    ctx.globalAlpha = b.hp < b.maxHp ? 0.67 : 1;
    ctx.fillRect(b.x, y, b.w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff25";
    ctx.fillRect(b.x, y, b.w, 2);
    if (b.type === "solid") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, y, b.w, h);
      ctx.clip();
      ctx.strokeStyle = "#8e9baa";
      ctx.lineWidth = 2;
      for (let x = b.x - h; x < b.x + b.w; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + h, y);
        ctx.stroke();
      }
      ctx.restore();
    } else if (b.type === "core") {
      ctx.strokeStyle = "#f5f4dc";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + b.w / 2 - 5, y + h / 2 - 5, 10, 10);
    } else if (b.hp > 1) {
      ctx.fillStyle = "#0f1113";
      for (let i = 0; i < b.hp; i++) {
        ctx.beginPath();
        ctx.arc(
          b.x + b.w / 2 + (i - (b.hp - 1) / 2) * 7,
          y + h / 2,
          1.8,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    if (b.hp < b.maxHp && b.hp > 0) {
      ctx.strokeStyle = "#0f1113";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * 0.6, y);
      ctx.lineTo(b.x + b.w * 0.4, y + h * 0.5);
      ctx.lineTo(b.x + b.w * 0.6, y + h);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#eef2f6";
  ctx.fillRect(paddle - width / 2, py, width, 13);
  ctx.fillStyle = "#2b9ed1";
  ctx.fillRect(paddle - width / 2, py, 8, 13);
  ctx.fillRect(paddle + width / 2 - 8, py, 8, 13);
  const displayBalls = balls.length ? balls : [{ x: paddle, y: py - 18 }];
  for (const b of displayBalls) {
    ctx.beginPath();
    ctx.fillStyle = effects.pierce > now ? "#ffeb3b" : "#fff6df";
    if (!settings.reduced) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#fff6df66";
    }
    ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  if (effects.shield) {
    ctx.fillStyle = "#6ead45";
    ctx.fillRect(0, H - 20, W, 3);
  }
  for (const d of drops) {
    ctx.fillStyle = "#171a1e";
    ctx.strokeStyle = "#d7a12a";
    ctx.lineWidth = 2;
    ctx.fillRect(d.x - 16, d.y - 14, 32, 28);
    ctx.strokeRect(d.x - 16, d.y - 14, 32, 28);
    ctx.fillStyle = "#ffeb3b";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      {
        wide: "↔",
        slow: "~",
        multi: "+",
        shield: "⌒",
        pierce: "↑",
        sticky: "•",
      }[d.type],
      d.x,
      d.y + 7,
    );
  }
  for (const p of particles) {
    ctx.globalAlpha = p.life / 0.6;
    ctx.fillStyle = palette[p.color];
    ctx.fillRect(p.x, p.y, 4, 4);
  }
  ctx.globalAlpha = 1;
  if (mode === "countdown") {
    ctx.fillStyle = "#0f111399";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#eef2f6";
    ctx.textAlign = "center";
    ctx.font = "500 68px sans-serif";
    ctx.fillText(
      Math.max(1, Math.ceil((countUntil - now) / 800)),
      W / 2,
      H / 2,
    );
  }
}
function frame(now) {
  const dt = Math.min(0.04, (now - last) / 1000 || 0);
  last = now;
  if (mode === "countdown" && now >= countUntil) mode = "playing";
  if (mode === "playing") {
    acc += dt;
    while (acc >= 1 / 120) {
      update(1 / 120, now);
      acc -= 1 / 120;
      if (mode !== "playing") {
        acc = 0;
        break;
      }
    }
    if (now - lastSave > 3500) {
      persist();
      lastSave = now;
    }
  } else acc = 0;
  draw(now);
  if (now > toastUntil) $("toast").classList.remove("show");
  requestAnimationFrame(frame);
}
function resize() {
  const rect = canvas.getBoundingClientRect();
  const oldH = H;
  if (rect.width <= 0 || rect.height <= 0) return;
  H = (W * rect.height) / rect.width;
  const ratio = H / oldH;
  balls.forEach((b) => repositionBall(b, oldH, H));
  drops.forEach((d) => (d.y *= ratio));
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}
new ResizeObserver(() => {
  if (canPause(mode)) pause("The screen changed.");
  resize();
}).observe(arena);
function move(e) {
  const r = canvas.getBoundingClientRect();
  target = clamp(
    ((e.clientX - r.left) / r.width) * W,
    width / 2 + 8,
    W - width / 2 - 8,
  );
}
canvas.addEventListener("pointerdown", (e) => {
  if (mode !== "playing" || zoomed) return;
  if (!e.isPrimary || pointer !== null) return;
  pointer = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  move(e);
  for (const b of balls)
    if (b.held) {
      b.held = false;
      b.vx = ballSpeed() * 0.3;
      b.vy = -ballSpeed() * 0.954;
    }
  e.preventDefault();
});
canvas.addEventListener("pointermove", (e) => {
  if (
    mode === "playing" &&
    (e.pointerType === "mouse" || e.pointerId === pointer)
  )
    move(e);
});
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerId === pointer) pointer = null;
});
canvas.addEventListener("pointercancel", () => {
  pointer = null;
  if (mode === "playing") pause("Let’s get comfortable.");
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener(
  "touchmove",
  (e) => {
    if (mode === "playing" && e.cancelable) e.preventDefault();
  },
  { passive: false },
);
window.addEventListener("keydown", (e) => {
  if (
    ["ArrowLeft", "ArrowRight", " "].includes(e.key) &&
    overlay.hidden &&
    !zoomed
  ) {
    e.preventDefault();
    keys[e.key] = true;
    if (e.key === " " && !e.repeat) {
      if (mode === "paused") resume();
      else if (mode === "playing") {
        const held = balls.filter((b) => b.held);
        if (held.length)
          held.forEach((b) => {
            b.held = false;
          });
        else pause();
      }
    }
  }
  if (e.key === "Escape" && mode === "playing") pause();
});
window.addEventListener("keyup", (e) => delete keys[e.key]);
// Keep keyboard focus inside the currently visible dialog.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const root = !$("recovery").hidden
    ? $("recovery")
    : !overlay.hidden
      ? card
      : null;
  if (!root) return;
  const items = [...root.querySelectorAll("button,input")];
  if (!items.length) return;
  const first = items[0],
    end = items.at(-1);
  if (
    e.shiftKey &&
    (document.activeElement === first || document.activeElement === root)
  ) {
    e.preventDefault();
    end.focus();
  } else if (
    !e.shiftKey &&
    (document.activeElement === end || document.activeElement === root)
  ) {
    e.preventDefault();
    first.focus();
  }
});
function checkZoom() {
  const v = window.visualViewport;
  if (!v) return;
  const enlarged = v.scale > 1.08;
  if (fitted && enlarged) {
    Object.assign(document.querySelector(".app").style, viewportStyle(v));
    return;
  }
  if (!enlarged && fitted) {
    fitted = false;
    document.querySelector(".app").removeAttribute("style");
    document.querySelector(".app").classList.remove("fitted");
  }
  if (enlarged) Object.assign($("recovery").style, viewportStyle(v));
  if (enlarged && !zoomed) {
    if (canPause(mode)) pause("Your game is safe.");
    zoomed = true;
    $("recovery").hidden = false;
    $("recovery-message").textContent = storageOK
      ? "The screen looks zoomed in. Your place is saved."
      : "The screen looks zoomed in. Your game is paused. Keep this page open.";
    syncModal();
    $("fit").focus({ preventScroll: true });
  } else if (!enlarged && zoomed) closeRecovery();
}
function closeRecovery() {
  zoomed = false;
  $("recovery").hidden = true;
  $("recovery").removeAttribute("style");
  syncModal();
  resize();
  if (!overlay.hidden) card.focus({ preventScroll: true });
}
window.visualViewport?.addEventListener("resize", checkZoom);
window.visualViewport?.addEventListener("scroll", checkZoom);
bind("fit", () => {
  const v = window.visualViewport;
  if (v?.scale > 1.08) {
    // Explicit one-tap escape: fit our content inside the visible viewport.
    // Safari's actual zoom stays as the user set it.
    fitted = true;
    document.querySelector(".app").classList.add("fitted");
    Object.assign(document.querySelector(".app").style, viewportStyle(v));
  }
  closeRecovery();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pause("Welcome back, whenever you’re ready.");
    if (saved) persist();
  }
});
window.addEventListener("pagehide", () => {
  pause("Welcome back, whenever you’re ready.");
  if (saved) persist();
});
window.addEventListener("pageshow", checkZoom);
window.addEventListener("blur", () => {
  if (canPause(mode)) pause();
});
bind("pause", () => {
  if (mode === "playing" || mode === "countdown") pause();
});
bind("help", help);
bind("settings", () => comfort());
bind("sound", () => {
  settings.sound = !settings.sound;
  saveSettings();
  beep();
});
updateSound();
resize();
home();
checkZoom();
requestAnimationFrame(frame);
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js").catch(() => {});
