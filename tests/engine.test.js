import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generate,
  circleRect,
  reflect,
  validSave,
  layout,
  auditLevel,
  levelRecipe,
  levelSeed,
  W,
  R,
  brickRect,
} from "../engine.js";
test("seeded levels reproduce exactly, including drops", () => {
  assert.deepEqual(generate(17, 42, 6), generate(17, 42, 6));
  assert.notDeepEqual(generate(17, 42, 6), generate(18, 42, 6));
});
test("generated boards fit and all targets are reachable around permanent bricks", () => {
  for (let level = 1; level <= 1000; level++)
    for (const columns of [5, 8, 12]) {
      const bricks = generate(level, 123, columns),
        audit = auditLevel(bricks);
      assert(audit.valid, JSON.stringify({ level, columns, ...audit }));
      assert.equal(new Set(bricks.map((b) => b.id)).size, bricks.length);
      assert(bricks.every((b) => b.hp >= 1 && b.hp <= 3));
    }
});
test("side and corner collisions reflect away and preserve speed", () => {
  const rect = { x: 100, y: 100, w: 60, h: 30 };
  for (const ball of [
    { x: 95, y: 110, vx: 200, vy: 20 },
    { x: 95, y: 95, vx: 100, vy: 100 },
    { x: 130, y: 95, vx: 10, vy: 200 },
  ]) {
    const n = circleRect(ball, rect);
    assert(n);
    const speed = Math.hypot(ball.vx, ball.vy);
    reflect(ball, n);
    assert(ball.vx * n.x + ball.vy * n.y >= 0);
    assert(Math.abs(Math.hypot(ball.vx, ball.vy) - speed) < 1e-6);
  }
  assert.equal(circleRect({ x: 10, y: 10 }, rect), null);
});
test("malformed saves are rejected and valid damaged boards survive", () => {
  const s = {
    version: 1,
    level: 3,
    seed: 1,
    score: 100,
    lives: 2,
    bricks: generate(3, 1),
  };
  s.bricks[0].hp = 0;
  assert(validSave(s));
  assert(!validSave({ ...s, bricks: [{ ...s.bricks[0], x: NaN }] }));
  assert(!validSave({ ...s, lives: -1 }));
  assert(!validSave({ version: 1 }));
  assert(!validSave(null));
});

test("short landscape and tall portrait boards stay between ceiling and paddle", () => {
  for (const height of [180, 200, 300, 600, 1000]) {
    const l = layout(height);
    const bricks = generate(100, 123, 8);
    for (const b of bricks) {
      const y = l.brickTop + (b.y - 0.105) * l.brickScale;
      assert(y > l.ceiling + 8);
      assert(y + b.h * l.brickScale < l.paddleY - 16);
    }
  }
});

test("large level numbers stay reproducible, saveable and seeded by the full number", () => {
  for (const level of [
    999999999,
    1000000000,
    1000000000000,
    Number.MAX_SAFE_INTEGER - 1,
    Number.MAX_SAFE_INTEGER,
  ]) {
    const b = generate(level, 42, 5);
    assert(auditLevel(b).valid);
    assert.deepEqual(b, generate(level, 42, 5));
    assert(
      validSave({
        version: 1,
        level,
        seed: 42,
        score: 10,
        lives: 3,
        bricks: b,
      }),
    );
  }
  assert.notEqual(levelSeed(1, 42), levelSeed(2 ** 32 + 1, 42));
  assert.throws(() => generate(Infinity, 42));
  assert.throws(() => generate(0, 42));
});
test("gentle opening, reward levels, and armor caps hold throughout long runs", () => {
  for (const level of [1, 2, 7, 14, 700, 7000000000]) {
    const b = generate(level, 99);
    if (level < 3 || level % 7 === 0)
      assert(b.every((b) => b.hp === 1 && b.type === "normal"));
    assert(b.some((b) => b.drop));
  }
  assert(generate(1, 99).some((b) => b.drop === "wide"));
  const names = new Set(),
    shapes = new Set();
  for (let level = 20; level < 1020; level++) {
    const b = generate(level, 99);
    names.add(levelRecipe(level, 99).name);
    shapes.add(JSON.stringify(b.map((b) => [b.x, b.y, b.w, b.type, b.hp])));
    assert(
      b.filter((b) => b.type === "solid").length <= Math.floor(b.length * 0.14),
    );
  }
  assert(names.size >= 12);
  assert(shapes.size > 990);
});
test("reachability validator detects sealed targets and ball-sized blocked gaps", () => {
  const solid = (id, x, y, w, h) => ({ id, x, y, w, h, hp: 1, type: "solid" });
  // Enclose a small target in four permanent walls in normalized board coordinates.
  const target = {
    id: 4,
    x: 280,
    y: 0.24,
    w: 20,
    h: 0.02,
    hp: 1,
    type: "normal",
  };
  const sealed = [
    solid(0, 240, 0.18, 100, 0.02),
    solid(1, 240, 0.3, 100, 0.02),
    solid(2, 240, 0.2, 20, 0.1),
    solid(3, 320, 0.2, 20, 0.1),
    target,
  ];
  assert(auditLevel(sealed, 1000).unreachable.includes(4));
  const open = sealed.filter((b) => b.id !== 1);
  assert(auditLevel(open, 1000).valid);
  const narrow = [
    ...sealed.filter((b) => b.id !== 1),
    solid(5, 240, 0.3, 44, 0.02),
    solid(6, 296, 0.3, 44, 0.02),
  ];
  assert(auditLevel(narrow, 1000).unreachable.includes(4));
});
// Independent reference: rasterize actual circle-vs-rectangle collisions, not
// the production validator's expanded-rectangle coordinate compression.
export function rasterReachable(bricks, height) {
  const field = layout(height),
    step = 3,
    cols = Math.floor((W - 2 * R) / step),
    rows = Math.floor((field.paddleY - field.ceiling - 2 * R) / step);
  const solids = bricks
      .filter((b) => b.type === "solid")
      .map((b) => brickRect(b, height)),
    seen = new Uint8Array(cols * rows),
    blocked = new Uint8Array(cols * rows),
    q = [];
  const point = (x, y) => ({
    x: R + (x + 0.5) * step,
    y: field.ceiling + R + (y + 0.5) * step,
  });
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (solids.some((b) => circleRect(point(x, y), b)))
        blocked[y * cols + x] = 1;
  for (let x = 0; x < cols; x++) {
    const id = (rows - 1) * cols + x;
    if (!blocked[id]) {
      seen[id] = 1;
      q.push(id);
    }
  }
  for (let i = 0; i < q.length; i++) {
    const id = q[i],
      x = id % cols,
      y = Math.floor(id / cols);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = ny * cols + nx;
      if (!blocked[n] && !seen[n]) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  return bricks
    .filter((b) => b.type !== "solid")
    .every((b) => {
      const rect = brickRect(b, height);
      for (
        let y = Math.max(
          0,
          Math.floor((rect.y - R - field.ceiling - R) / step),
        );
        y < rows && point(0, y).y <= rect.y + rect.h + R;
        y++
      )
        for (
          let x = Math.max(0, Math.floor((rect.x - 2 * R) / step));
          x < cols && point(x, 0).x <= rect.x + rect.w + R;
          x++
        )
          if (seen[y * cols + x] && circleRect(point(x, y), rect)) return true;
      return false;
    });
}
test("independent ball-clearance search reaches every target on representative boards", () => {
  for (let i = 0; i < 96; i++)
    for (const height of [180, 400, 1000]) {
      const level = 4 + i * 131,
        bricks = generate(level, i * 7919, [5, 8, 12][i % 3]);
      assert(
        rasterReachable(bricks, height),
        JSON.stringify({ level, height }),
      );
    }
});
