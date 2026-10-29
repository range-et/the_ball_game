import assert from "node:assert/strict";
import { generate, auditLevel, levelRecipe, validSave } from "../engine.js";
const heights = [180, 480, 1200],
  names = new Set();
let solids = 0,
  bricks = 0;
for (let i = 0; i < 100000; i++) {
  const level =
    i < 80000
      ? Math.floor(i / 8) + 1
      : [1e9, 1e12, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER][
          i % 4
        ] -
        (Math.floor(i / 32) % 500);
  const columns = 5 + (i % 8),
    seed = Math.imul(i + 1, 2654435761) >>> 0,
    board = generate(level, seed, columns);
  for (const height of heights) {
    const audit = auditLevel(board, height);
    assert(
      audit.valid,
      JSON.stringify({ level, seed, columns, height, ...audit }),
    );
  }
  assert(
    validSave({ version: 1, level, seed, score: 0, lives: 3, bricks: board }),
  );
  assert(board.some((b) => b.drop));
  assert(board.every((b) => b.hp >= 1 && b.hp <= 3));
  names.add(levelRecipe(level, seed).name);
  solids += board.filter((b) => b.type === "solid").length;
  bricks += board.length;
}
console.log(
  JSON.stringify(
    {
      boards: 100000,
      geometryChecks: 300000,
      columns: [5, 6, 7, 8, 9, 10, 11, 12],
      heights,
      families: names.size,
      averageBricks: Math.round(bricks / 1000) / 100,
      solidBricksChecked: solids,
      unreachableTargets: 0,
      status: "passed",
    },
    null,
    2,
  ),
);
