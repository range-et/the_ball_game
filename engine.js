export const W = 600,
  R = 8;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Mix the complete level number, not level * a constant (which loses precision
// on long runs). Full saved boards stay compatible with earlier generators.
export function levelSeed(level, seed) {
  let hash = 2166136261;
  for (const ch of `${seed}:${level}`)
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return hash >>> 0;
}
// There is no final board. At the numeric counter limit, keep that label and
// advance the run seed rather than overflowing into an invalid saved level.
export function nextLevelIdentity(level, seed) {
  if (level < Number.MAX_SAFE_INTEGER) return { level: level + 1, seed };
  let nextSeed = levelSeed(level, `${seed}:next`);
  if (nextSeed === seed) nextSeed = (seed + 1) >>> 0;
  return { level, seed: nextSeed };
}
const FAMILIES = [
  "Little gardens",
  "Open arches",
  "Little islands",
  "Stepping stones",
  "Open circles",
  "Woven ribbons",
  "Crossroads",
  "Diamonds",
  "Honeycomb",
  "Gentle waves",
  "Courtyards",
  "Constellations",
];
export function levelRecipe(level, seed) {
  if (!Number.isSafeInteger(level) || level < 1)
    throw new RangeError("Level must be a positive safe integer");
  const rand = random(levelSeed(level, seed));
  const rest = level > 1 && level % 7 === 0;
  const family = level <= 3 ? level - 1 : Math.floor(rand() * FAMILIES.length);
  return {
    family,
    rest,
    name:
      level === 1
        ? "A fresh start"
        : rest
          ? "A little breather"
          : FAMILIES[family],
    phase: Math.floor(rand() * 12),
    gap: [8, 10, 12][Math.floor(rand() * 3)],
    padding: 28 + Math.floor(rand() * 3) * 4,
    rowStep: 0.041 + rand() * 0.004,
    flipX: rand() < 0.5,
    flipY: rand() < 0.5,
    rows:
      level === 1
        ? 3
        : rest
          ? 3 + Math.floor(rand() * 2)
          : Math.min(
              8,
              4 + Math.floor(Math.log2(level)) + Math.floor(rand() * 2),
            ),
  };
}
export function brickRect(brick, height) {
  const field = layout(height);
  return {
    x: brick.x,
    y: field.brickTop + (brick.y - 0.105) * field.brickScale,
    w: brick.w,
    h: brick.h * field.brickScale,
  };
}
// Exact coordinate-compressed free-space search for a ball center, with an
// extra 2 units of clearance around permanent obstacles. Colored bricks may
// be destroyed on the way; only permanent geometry blocks this search.
export function auditLevel(bricks, height = 180) {
  const field = layout(height),
    margin = R + 2;
  const bounds = {
    left: R,
    right: W - R,
    top: field.ceiling + R,
    bottom: field.paddleY - R,
  };
  const rectangles = bricks
    .filter((b) => b.hp > 0)
    .map((b) => ({ brick: b, ...brickRect(b, height) }));
  const outside = rectangles
    .filter(
      (b) =>
        b.x < 0 ||
        b.x + b.w > W ||
        b.y <= bounds.top ||
        b.y + b.h >= bounds.bottom,
    )
    .map((b) => b.brick.id);
  const solids = rectangles
    .filter((b) => b.brick.type === "solid")
    .map((b) => ({
      left: Math.max(bounds.left, b.x - margin),
      right: Math.min(bounds.right, b.x + b.w + margin),
      top: Math.max(bounds.top, b.y - margin),
      bottom: Math.min(bounds.bottom, b.y + b.h + margin),
    }));
  const axis = (lo, hi, values) =>
    [...new Set([lo, hi, ...values.filter((n) => n > lo && n < hi)])].sort(
      (a, b) => a - b,
    );
  const xs = axis(
    bounds.left,
    bounds.right,
    solids.flatMap((b) => [b.left, b.right]),
  );
  const ys = axis(
    bounds.top,
    bounds.bottom,
    solids.flatMap((b) => [b.top, b.bottom]),
  );
  const cols = xs.length - 1,
    rows = ys.length - 1,
    blocked = new Uint8Array(cols * rows),
    seen = new Uint8Array(cols * rows),
    queue = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = (xs[x] + xs[x + 1]) / 2,
        py = (ys[y] + ys[y + 1]) / 2;
      if (
        solids.some(
          (b) => px > b.left && px < b.right && py > b.top && py < b.bottom,
        )
      )
        blocked[y * cols + x] = 1;
    }
  for (let x = 0; x < cols; x++) {
    const id = (rows - 1) * cols + x;
    if (!blocked[id]) {
      seen[id] = 1;
      queue.push(id);
    }
  }
  const free = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i],
      x = id % cols,
      y = Math.floor(id / cols);
    free.push({ left: xs[x], right: xs[x + 1], top: ys[y], bottom: ys[y + 1] });
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const next = ny * cols + nx;
      if (!blocked[next] && !seen[next]) {
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  // A reachable free cell must contain a position that can actually touch
  // the target with a circular ball. Rectangle separation handles rounded
  // ball corners without requiring the center to enter a brick's footprint.
  const unreachable = rectangles
    .filter(
      (b) =>
        b.brick.type !== "solid" &&
        !free.some((cell) => {
          const dx = Math.max(b.x - cell.right, cell.left - (b.x + b.w), 0);
          const dy = Math.max(b.y - cell.bottom, cell.top - (b.y + b.h), 0);
          return Math.hypot(dx, dy) < R - 0.25;
        }),
    )
    .map((b) => b.brick.id);
  const count = rectangles.filter((b) => b.brick.type !== "solid").length;
  return {
    valid: outside.length === 0 && unreachable.length === 0 && count > 0,
    outside,
    unreachable,
    breakableCount: count,
  };
}
export function generate(level, seed, columns = 8) {
  const recipe = levelRecipe(level, seed),
    rand = random(levelSeed(level, seed) ^ 0x85ebca6b);
  const cols = clamp(Math.floor(columns), 5, 12),
    rows = recipe.rows,
    gap = recipe.gap,
    bw = (W - 2 * recipe.padding - (cols - 1) * gap) / cols;
  const bricks = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const c = recipe.flipX ? cols - 1 - col : col,
        r = recipe.flipY ? rows - 1 - row : row;
      const nx = (c + 0.5 - cols / 2) / (cols / 2),
        ny = (r + 0.5 - rows / 2) / (rows / 2),
        phase = recipe.phase;
      const shapes = [
        r % 3 !== 2 || c % 3 !== phase % 3,
        r >= rows / 2 || Math.abs(nx) > 0.3 || r === 0,
        (Math.floor(c / 2) + Math.floor(r / 2) + phase) % 3 !== 0,
        (c + r + phase) % cols < Math.ceil(cols * 0.65),
        nx * nx + ny * ny > 0.18 && nx * nx + ny * ny < 1.5,
        (r + c + phase) % 4 !== 0,
        r !== Math.floor(rows / 2) || c % 3 === phase % 3,
        Math.abs(nx) + Math.abs(ny) < 1.45,
        (r * 2 + c + phase) % 4 !== 0,
        r >= Math.floor((Math.sin((c + phase) * 0.9) + 1) * rows * 0.22),
        r === 0 || r === rows - 1 || Math.abs(nx) > 0.45,
        rand() > 0.25,
      ];
      if (level !== 1 && !shapes[recipe.family]) continue;
      const armorChance =
        recipe.rest || level < 3
          ? 0
          : Math.min(0.65, 0.14 + Math.log2(level) * 0.08);
      const hp =
        rand() < armorChance ? 2 + (level >= 12 && rand() < 0.25 ? 1 : 0) : 1;
      bricks.push({
        id: row * cols + col,
        x: recipe.padding + col * (bw + gap),
        y: 0.105 + row * recipe.rowStep,
        w: bw,
        h: 0.031,
        hp,
        maxHp: hp,
        type: "normal",
        color: (row + phase) % 3,
        drop:
          rand() < 0.15
            ? ["wide", "slow", "multi", "shield", "pierce", "sticky"][
                Math.floor(rand() * 6)
              ]
            : null,
      });
    }
  if (level >= 3 && !recipe.rest) {
    const core = bricks.reduce((best, b) =>
      Math.abs(b.x + b.w / 2 - W / 2) + Math.abs(b.y - 0.148) * 1000 <
      Math.abs(best.x + best.w / 2 - W / 2) + Math.abs(best.y - 0.148) * 1000
        ? b
        : best,
    );
    Object.assign(core, { type: "core", hp: 2, maxHp: 2 });
  }
  if (level >= 4 && !recipe.rest) {
    const budget = Math.min(
      Math.floor(bricks.length * 0.14),
      1 + Math.floor(Math.log2(level)),
    );
    const candidates = bricks
      .filter(
        (b) =>
          b.type === "normal" &&
          Math.floor(b.id / cols) > 0 &&
          Math.floor(b.id / cols) < rows - 1,
      )
      .map((b) => ({ b, rank: rand() }))
      .sort((a, b) => a.rank - b.rank);
    for (const { b } of candidates.slice(0, budget))
      Object.assign(b, { type: "solid", hp: 1, maxHp: 1, drop: null });
  }
  // At the shortest supported field the vertical clearances are smallest.
  // If solid geometry creates an inaccessible pocket, soften obstacles until
  // every target has a route. Longer fields only widen these clearances.
  let audit = auditLevel(bricks);
  while (!audit.valid) {
    const solid = bricks.findLast((b) => b.type === "solid");
    if (!solid) throw new Error("Invalid generated board");
    Object.assign(solid, { type: "normal", hp: 2, maxHp: 2 });
    audit = auditLevel(bricks);
  }
  if (!bricks.some((b) => b.drop))
    bricks[Math.floor(rand() * bricks.length)].drop = "wide";
  if (level === 1) bricks[Math.floor(bricks.length / 2)].drop = "wide";
  return bricks;
}
export function circleRect(ball, rect) {
  const nx = clamp(ball.x, rect.x, rect.x + rect.w),
    ny = clamp(ball.y, rect.y, rect.y + rect.h);
  let dx = ball.x - nx,
    dy = ball.y - ny;
  const d = Math.hypot(dx, dy);
  if (d >= R) return null;
  if (d > 0) return { x: dx / d, y: dy / d, depth: R - d };
  const sides = [
    { v: ball.x - rect.x, x: -1, y: 0 },
    { v: rect.x + rect.w - ball.x, x: 1, y: 0 },
    { v: ball.y - rect.y, x: 0, y: -1 },
    { v: rect.y + rect.h - ball.y, x: 0, y: 1 },
  ].sort((a, b) => a.v - b.v);
  return { ...sides[0], depth: R + sides[0].v };
}
export function reflect(ball, normal) {
  const dot = ball.vx * normal.x + ball.vy * normal.y;
  if (dot < 0) {
    ball.vx -= 2 * dot * normal.x;
    ball.vy -= 2 * dot * normal.y;
  }
}
export function validSave(s) {
  return (
    s &&
    s.version === 1 &&
    Number.isSafeInteger(s.level) &&
    s.level > 0 &&
    Number.isFinite(s.seed) &&
    Number.isFinite(s.score) &&
    Number.isInteger(s.lives) &&
    s.lives >= 0 &&
    s.lives <= 5 &&
    Array.isArray(s.bricks) &&
    s.bricks.length > 0 &&
    s.bricks.length <= 200 &&
    s.bricks.every(
      (b) =>
        b &&
        Number.isFinite(b.x) &&
        b.x >= 0 &&
        Number.isFinite(b.y) &&
        b.y >= 0 &&
        b.y < 0.7 &&
        Number.isFinite(b.w) &&
        b.w > 0 &&
        b.w < W &&
        Number.isFinite(b.h) &&
        b.h > 0 &&
        b.h < 0.1 &&
        Number.isInteger(b.hp) &&
        b.hp >= 0 &&
        b.hp <= 10 &&
        ["normal", "core", "solid"].includes(b.type),
    )
  );
}

export function layout(height) {
  return {
    paddleY: height - Math.min(94, height * 0.18),
    ceiling: Math.min(45, height * 0.065),
    brickTop: Math.min(70, height * 0.15),
    brickScale: Math.min(height, (height - 130) / 0.38),
  };
}
