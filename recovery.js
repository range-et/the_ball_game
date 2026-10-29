import { R, clamp, layout } from "./engine.js";
export function canPause(mode) {
  return mode === "playing" || mode === "countdown";
}
// Coordinates are CSS pixels in the layout viewport. Counter-scale only our UI,
// never the browser's zoom level or operating-system accessibility settings.
export function viewportStyle(v) {
  return {
    inset: "auto",
    left: `${v.offsetLeft}px`,
    top: `${v.offsetTop}px`,
    width: `${v.width * v.scale}px`,
    height: `${v.height * v.scale}px`,
    transformOrigin: "top left",
    transform: `scale(${1 / v.scale})`,
  };
}
export function repositionBall(ball, oldHeight, newHeight) {
  const old = layout(oldHeight),
    next = layout(newHeight);
  const oldTop = old.ceiling + R + 1,
    oldBottom = old.paddleY - R - 1;
  const newTop = next.ceiling + R + 1,
    newBottom = next.paddleY - R - 1;
  const fraction = clamp((ball.y - oldTop) / (oldBottom - oldTop), 0, 1);
  ball.y = ball.held
    ? next.paddleY - 12
    : newTop + fraction * (newBottom - newTop);
}
