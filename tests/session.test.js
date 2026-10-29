import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as engine from "../engine.js";
import * as storage from "../storage.js";
import * as recovery from "../recovery.js";

// Run the real game module against small DOM/event/storage doubles. This tests
// interruption state transitions without pretending to emulate iOS gestures.
function gameHarness(data = new Map(), denied = false, initialScale = 1) {
  const nodes = new Map();
  let document,
    clock = 1000,
    resizing;
  class Node {
    constructor(id) {
      this.id = id;
      this.hidden = false;
      this.listeners = {};
      this.style = {};
      this.classList = { toggle() {}, add() {}, remove() {} };
      this.rect = { width: 350, height: 550, left: 0, top: 0 };
      this.clientWidth = 350;
      this.checked = false;
      nodes.set(id, this);
    }
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    }
    emit(type, event = {}) {
      for (const fn of this.listeners[type] || []) fn(event);
    }
    set innerHTML(value) {
      this.html = value;
      for (const id of this.childIds || []) nodes.delete(id);
      this.childIds = [...value.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
      for (const id of this.childIds) new Node(id);
    }
    get innerHTML() {
      return this.html || "";
    }
    querySelectorAll() {
      return [];
    }
    setAttribute(k, v) {
      this[k] = v;
    }
    toggleAttribute(k, v) {
      this[k] = v;
    }
    removeAttribute(k) {
      if (k === "style") this.style = {};
      else delete this[k];
    }
    focus() {
      document.activeElement = this;
    }
    getBoundingClientRect() {
      return this.rect;
    }
    setPointerCapture() {}
  }
  for (const id of [
    ...readFileSync(new URL("../index.html", import.meta.url), "utf8").matchAll(
      /id="([^"]+)"/g,
    ),
  ].map((m) => m[1]))
    new Node(id);
  const body = new Node("body"),
    app = new Node(".app");
  document = new Node("document");
  Object.assign(document, {
    body,
    hidden: false,
    getElementById: (id) => nodes.get(id),
    querySelector: (selector) => nodes.get(selector) || new Node(selector),
  });
  nodes.get("recovery").hidden = true;
  nodes.get("game").getContext = () => new Proxy({}, { get: () => () => {} });
  const viewport = new Node("viewport");
  Object.assign(viewport, {
    scale: initialScale,
    width: 390 / initialScale,
    height: 844 / initialScale,
    offsetLeft: 0,
    offsetTop: 0,
  });
  const window = new Node("window");
  window.visualViewport = viewport;
  const localStorage = {
    getItem: (key) => {
      if (denied) throw Error("blocked");
      return data.get(key) || null;
    },
    setItem: (key, value) => {
      if (denied) throw Error("blocked");
      data.set(key, value);
    },
  };
  const context = {
    ...engine,
    ...storage,
    ...recovery,
    window,
    document,
    navigator: {},
    localStorage,
    matchMedia: () => ({ matches: false }),
    structuredClone,
    performance: { now: () => clock },
    requestAnimationFrame() {},
    devicePixelRatio: 2,
    ResizeObserver: class {
      constructor(fn) {
        resizing = fn;
      }
      observe() {}
    },
    MutationObserver: class {
      observe() {}
    },
  };
  vm.createContext(context);
  const source = readFileSync(
    new URL("../game.js", import.meta.url),
    "utf8",
  ).replace(/^import[\s\S]*?from [^\n]+;\n/gm, "");
  vm.runInContext(
    source +
      `\nglobalThis.api={get state(){return state},get saved(){return saved},get mode(){return mode},get zoomed(){return zoomed},get fitted(){return fitted},get balls(){return balls},get height(){return H},get pointer(){return pointer},home,prepare,launch,pause,resume,lose,nextLevel,hitBrick,checkZoom,resize,frame, persist, start(){resetRound();prepare();document.getElementById('launch').emit('click')},setBalls(value){balls=value}};`,
    context,
  );
  return {
    api: context.api,
    document,
    window,
    viewport,
    nodes,
    data,
    app,
    resize: () => resizing(),
    clock: (value) => (clock = value),
    deny: () => (denied = true),
  };
}
const snapshot = (h) => JSON.stringify(h.api.state);

test("pinch zoom pauses play, saves immediately and never resumes without a tap", () => {
  for (const scale of [1.1, 1.5, 2, 4]) {
    const h = gameHarness();
    h.api.start();
    const before = snapshot(h);
    Object.assign(h.viewport, {
      scale,
      width: 390 / scale,
      height: 844 / scale,
      offsetLeft: 33,
      offsetTop: 45,
    });
    h.viewport.emit("resize");
    assert.equal(h.api.mode, "paused");
    assert.equal(snapshot(h), before);
    assert.equal(h.nodes.get("recovery").hidden, false);
    assert.equal(h.nodes.get("overlay").inert, true);
    assert.equal(
      h.nodes.get("recovery").style.transform,
      `scale(${1 / scale})`,
    );
    h.api.resume();
    assert.equal(h.api.mode, "paused");
    h.viewport.scale = 1;
    h.viewport.emit("resize");
    assert.equal(h.nodes.get("recovery").hidden, true);
    assert.equal(h.api.mode, "paused");
    assert.equal(snapshot(h), before);
  }
});
test("one-tap fit escapes zoom recovery while leaving the game safely paused", () => {
  const h = gameHarness();
  h.api.start();
  const before = snapshot(h);
  Object.assign(h.viewport, {
    scale: 2,
    width: 195,
    height: 422,
    offsetLeft: 22,
    offsetTop: 35,
  });
  h.viewport.emit("resize");
  h.nodes.get("fit").emit("click");
  assert(h.api.fitted);
  assert(!h.api.zoomed);
  assert(h.nodes.get("recovery").hidden);
  assert.equal(h.app.style.width, "390px");
  assert.equal(h.app.style.transform, "scale(0.5)");
  assert.equal(h.api.mode, "paused");
  assert.equal(snapshot(h), before);
  h.viewport.emit("scroll");
  assert(h.nodes.get("recovery").hidden);
  h.api.resume();
  assert.equal(h.api.mode, "countdown");
  h.viewport.scale = 1;
  h.viewport.emit("resize");
  assert.equal(h.api.fitted, false);
  assert.deepEqual(h.app.style, {});
});
test("leaving retry or completed-level screens preserves their correct next action", () => {
  const h = gameHarness();
  h.api.start();
  h.api.lose();
  const before = snapshot(h);
  h.document.hidden = true;
  h.document.emit("visibilitychange");
  h.window.emit("blur");
  assert.equal(h.api.mode, "waiting");
  assert(h.nodes.get("retry"));
  assert.equal(snapshot(h), before);
  h.api.nextLevel();
  const next = snapshot(h);
  h.document.emit("visibilitychange");
  assert.equal(h.api.mode, "waiting");
  assert(h.nodes.get("next"));
  assert.equal(snapshot(h), next);
});
test("zero-chance retry survives interruptions and reload with a fresh set of chances", () => {
  const h = gameHarness();
  h.api.start();
  for (let i = 0; i < 3; i++) h.api.lose();
  h.document.hidden = true;
  h.document.emit("visibilitychange");
  assert.equal(h.api.state.lives, 0);
  assert(h.nodes.get("retry"));
  const reopened = gameHarness(h.data);
  reopened.nodes.get("play").emit("click");
  assert.equal(reopened.api.state.lives, 3);
  assert.equal(reopened.api.state.level, h.api.state.level);
});
test("rotation during countdown pauses and keeps balls above the new paddle", () => {
  const h = gameHarness();
  h.api.start();
  h.api.pause();
  h.api.resume();
  const before = snapshot(h);
  h.api.setBalls([{ x: 300, y: h.api.height * 0.89, vx: 30, vy: 180 }]);
  h.nodes.get("game").rect = { width: 750, height: 220, left: 0, top: 0 };
  h.resize();
  assert.equal(h.api.mode, "paused");
  assert.equal(snapshot(h), before);
  assert(h.api.balls[0].y < engine.layout(h.api.height).paddleY - engine.R);
  assert(h.api.balls[0].y > engine.layout(h.api.height).ceiling + engine.R);
});
test("each brick hit is durable immediately, including reload and damaged armor", () => {
  const h = gameHarness();
  h.api.start();
  h.api.hitBrick(h.api.state.bricks[0]);
  const before = snapshot(h);
  const reopened = gameHarness(h.data);
  assert.equal(snapshot(reopened), before);
  assert.equal(reopened.api.mode, "menu");
  h.data.set(storage.SETTINGS_KEY, "{broken");
  assert.equal(snapshot(gameHarness(h.data)), before);
  h.data.set(storage.SAVE_KEY, "{broken");
  assert.equal(snapshot(gameHarness(h.data)), before);
});
test("storage refusal retains in-memory progress and gives a visible warning", () => {
  const h = gameHarness();
  h.api.start();
  h.deny();
  h.api.hitBrick(h.api.state.bricks[0]);
  const before = snapshot(h);
  h.api.pause();
  assert.match(h.nodes.get("card").innerHTML, /can’t save/);
  h.api.home();
  h.nodes.get("play").emit("click");
  assert.equal(snapshot(h), before);
});
test("backgrounding the countdown stops it and repeated interruptions cost no chance", () => {
  const h = gameHarness();
  h.api.start();
  h.api.pause();
  h.api.resume();
  const before = snapshot(h);
  h.window.emit("blur");
  assert.equal(h.api.mode, "paused");
  h.document.hidden = true;
  h.document.emit("visibilitychange");
  h.window.emit("pagehide");
  h.clock(100000);
  h.api.frame(100000);
  assert.equal(h.api.mode, "paused");
  assert.equal(snapshot(h), before);
});
test("secondary-finger release cannot take ownership from the controlling finger", () => {
  const h = gameHarness();
  h.api.start();
  const c = h.nodes.get("game");
  c.emit("pointerdown", {
    pointerId: 1,
    isPrimary: true,
    clientX: 120,
    preventDefault() {},
  });
  c.emit("pointerdown", {
    pointerId: 2,
    isPrimary: false,
    clientX: 240,
    preventDefault() {},
  });
  c.emit("pointerup", { pointerId: 2 });
  assert.equal(h.api.pointer, 1);
  c.emit("pointercancel");
  assert.equal(h.api.mode, "paused");
  assert.equal(h.api.pointer, null);
});

test("reopening a still-zoomed page preserves progress and recovers to the menu", () => {
  const h = gameHarness();
  h.api.start();
  h.api.hitBrick(h.api.state.bricks[0]);
  const before = snapshot(h);
  const reopened = gameHarness(h.data, false, 4);
  assert(reopened.api.zoomed);
  assert.equal(reopened.api.mode, "menu");
  assert.equal(snapshot(reopened), before);
  reopened.nodes.get("fit").emit("click");
  assert(reopened.nodes.get("recovery").hidden);
  assert(reopened.nodes.get("play"));
  assert.equal(snapshot(reopened), before);
});

test("pagehide alone pauses an active game before back-forward caching", () => {
  const h = gameHarness();
  h.api.start();
  const before = snapshot(h);
  h.window.emit("pagehide");
  assert.equal(h.api.mode, "paused");
  h.clock(100000);
  h.api.frame(100000);
  assert.equal(snapshot(h), before);
  assert.equal(h.api.mode, "paused");
});
