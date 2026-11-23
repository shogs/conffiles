// Pinned panes: a tab-like view in the layout's "pinned" column (beside the sidebar,
// full height) of terminals moved out of their tabs, plus shells started in it (split). Each space
// has its own pins, and its own open / zoomed pane / maximised view; it starts closed.
// Global pins (pinned across spaces, key "*") show in every space, above that space's own.
// A worktree space shares its main checkout's (shared "space.group", from my-spaces): pins and
// view state are kept per group, the space a worktree is listed under in the sidebar.
//
// The column is a title row, "pinned-orphans" (pins whose space closed: see orphans), "pinned-global" (the global pins' cards) and a stack,
// "pinned-body", holding "pinned-empty" and one column of cards per space with pins. Pin, unpin, split and close rewrite that
// structure (layout.set), as do move and swap (reorder); open, zoom and maximise and switching spaces only show, hide,
// select and resize nodes (applyView), which panel-rail runs when the space changes.
//
// shared: "pinned.panes" {space or "*": [{terminal, name, cwd, program, space, tab, own}]} (space
// and tab: where it came from; own: started here, so unpinning it puts it in the shown tab), "pinned.open" / "pinned.max" {space: bool}, "pinned.zoom"
// {space: terminal}, "pinned.width" (the column's px while not maximised), "pinned.agents"
// (pinned terminals that report a status, as agents() describes agents; see pollAgents).
//
// One file, hard-linked into my-pinned-panes, my-pane, my-workspace-chrome, my-menu and panel-rail
// (mods can't import across folders): save it in place, don't replace it.
import { run, exec, shared, setShared, layout, panes, spaces, focused, notify, machines } from "herdr";

const KEY = "pinned.panes", OPEN = "pinned.open", MAX = "pinned.max", ZOOM = "pinned.zoom", WIDTH = "pinned.width", AGENTS = "pinned.agents", REVEAL = "pinned.reveal";

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Ids can't hold the "/" of a remote address or space.
const slug = (id) => id.replace(/[^A-Za-z0-9_-]/g, "_");
const bodyId = (space) => `pinned-sp-${slug(space)}`;
const cardId = (terminal) => `pinned-card-${slug(terminal)}`;
const map = (key) => shared(key) ?? {};
const put = (key, space, value) => setShared(key, { ...map(key), [space]: value });

// The space shown, and the group it belongs to (its own id, or for a worktree space its
// main checkout's): pins and view state are keyed by group.
export const shownSpace = () => spaces().find((s) => s.active)?.id;
export const groupOf = (space) => (shared("space.group") ?? {})[space] ?? space;
export const activeSpace = () => groupOf(shownSpace());
export function all() {
  const v = shared(KEY);
  return v && !Array.isArray(v) ? v : {};
}
export const GLOBAL = "*";
export const list = (space = activeSpace()) => all()[space] ?? [];
export const globals = () => all()[GLOBAL] ?? [];
// What a space's view shows: the global pins, then its own.
export const visible = (space = activeSpace()) => [...globals(), ...list(space)];
export const isGlobal = (terminal) => globals().some((x) => x.terminal === terminal);

// Pins whose space closed (exit in its last pane, a close from outside glass): still running,
// with no view to show in. Listed in every space's pinned view, to pin here, open as a tab or kill.
// A space on a machine whose layout isn't ready yet isn't gone.
function gone(key) {
  if (key === GLOBAL || spaces().some((s) => s.id === key)) return false;
  const machine = key.includes("/") ? key.split("/")[0] : null;
  return machines().find((m) => m.name === machine)?.layout === "ready";
}
export const orphans = () => Object.entries(all()).filter(([k]) => gone(k)).flatMap(([, pins]) => pins);
// The orphans block's height: a title row and one row each.
export const orphansHeight = (n) => 34 + 28 * n;

// An orphan into the shown space's pins; unpinned later, it gets a new tab there.
export function adopt(terminal) {
  const key = keyOf(terminal), pin = all()[key]?.find((x) => x.terminal === terminal);
  if (!pin) return;
  const next = { ...all(), [key]: all()[key].filter((x) => x.terminal !== terminal) };
  if (!next[key].length) delete next[key];
  const space = activeSpace();
  next[space] = [...(next[space] ?? []), { ...pin, space: shownSpace(), tab: null, own: false }];
  save(next);
}

// An orphan out of the pins, into a new tab of the shown space.
export function openAsTab(terminal) {
  unpin(terminal, false);
  run("terminal.keep", { terminal });
}

// Show the pinned view (when a space with pins goes, so its orphans are seen).
export function show(space = activeSpace()) {
  put(OPEN, space, true);
  applyView(space);
}
// The key ("*" or a space) a pinned terminal is under.
const keyOf = (terminal) => Object.keys(all()).find((k) => all()[k].some((x) => x.terminal === terminal));
export const isOpen = (space = activeSpace()) => Boolean(map(OPEN)[space]);
export const isMax = (space = activeSpace()) => isOpen(space) && Boolean(map(MAX)[space]);
// The zoomed pane, while it is still pinned and there is another to hide.
export function zoomOf(space = activeSpace()) {
  const z = map(ZOOM)[space], pins = visible(space);
  return pins.length > 1 && pins.some((p) => p.terminal === z) ? z : null;
}

// What the shown space wants: the stack child, hidden cards and sections (zoom leaves one
// card), each section's height share (its cards), the column and the tab area.
function view(space) {
  const g = globals(), own = list(space), open = isOpen(space), max = isMax(space), zoom = zoomOf(space);
  const shows = (p) => !zoom || p.terminal === zoom;
  const gCount = g.filter(shows).length, ownCount = own.filter(shows).length;
  return {
    body: own.length ? bodyId(space) : "pinned-empty",
    hidden: new Set(zoom ? [...g, ...own].filter((p) => p.terminal !== zoom).map((p) => cardId(p.terminal)) : []),
    global: gCount > 0,
    // The empty hint shows only when there's nothing pinned at all.
    own: ownCount > 0 || (!g.length && !own.length),
    gWeight: Math.max(1, gCount), ownWeight: Math.max(1, ownCount),
    orphans: orphans().length,
    open, max,
  };
}

// size: what the card has now (a drag between cards), kept across rewrites.
function card(p, hidden, size) {
  const id = slug(p.terminal);
  return {
    ...(size ? { size } : {}),
    // Framed like a tab's pane, accent all round while it has the keyboard. A layout border
    // can't do that here (a column's focus doesn't see terminal blocks, and a block's border
    // also crosses under the header), so the header and three my-pinned-frame strips draw it.
    id: `pinned-card-${id}`, type: "column", resizable: false, hidden, background: "#00000000",
    children: [
      { id: `pinned-head-${id}`, type: "block", size: { px: 30 }, content: { mod: "my-pinned-panes", props: { terminal: p.terminal } } },
      {
        id: `pinned-mid-${id}`, type: "row", resizable: false,
        children: [
          { id: `pinned-left-${id}`, type: "block", size: { px: 1 }, content: { mod: "my-pinned-frame", props: { terminal: p.terminal, edge: "side" } } },
          { id: `pinned-term-${id}`, type: "block", background: "canvas", content: { terminal: p.terminal } },
          { id: `pinned-right-${id}`, type: "block", size: { px: 1 }, content: { mod: "my-pinned-frame", props: { terminal: p.terminal, edge: "side" } } },
        ],
      },
      { id: `pinned-foot-${id}`, type: "block", size: { px: 10 }, content: { mod: "my-pinned-frame", props: { terminal: p.terminal, edge: "bottom" } } },
    ],
  };
}

// The column's width while not maximised: what it has now, else what it last had.
function width(column) {
  const px = column?.size?.px;
  if (px && !column.size.weight) { if (px !== shared(WIDTH)) setShared(WIDTH, px); return px; }
  return shared(WIDTH) ?? 460;
}

// Rewrite the column's structure from the pins, with the shown space's view baked in.
export function sync() {
  const root = JSON.parse(JSON.stringify(layout()));
  const column = find(root, "pinned"), work = find(root, "work");
  if (!column) return;
  const space = activeSpace(), v = view(space), w = width(column);
  const sized = (p, hidden) => card(p, hidden, find(column, cardId(p.terminal))?.size);
  column.children = [
    { id: "pinned-title", type: "block", size: { px: 30 }, content: { mod: "my-pinned-panes", props: { title: true } } },
    { id: "pinned-orphans", type: "block", hidden: !v.orphans, size: { px: orphansHeight(v.orphans) }, content: { mod: "my-pinned-panes", props: { orphans: true } } },
    {
      id: "pinned-global", type: "column", gap: 8, hidden: !v.global, size: { weight: v.gWeight },
      children: globals().map((p) => sized(p, v.hidden.has(cardId(p.terminal)))),
    },
    {
      id: "pinned-body", type: "stack", active: v.body, hidden: !v.own, size: { weight: v.ownWeight },
      children: [
        { id: "pinned-empty", type: "block", content: { mod: "my-pinned-panes", props: {} } },
        ...Object.entries(all()).filter(([s, pins]) => s !== GLOBAL && !gone(s) && pins.length).map(([s, pins]) => ({
          // Resizable: drag between cards (Herdr keeps the sizes by card id).
          id: bodyId(s), type: "column", gap: 8,
          children: pins.map((p) => sized(p, s === space && v.hidden.has(cardId(p.terminal)))),
        })),
      ],
    },
  ];
  column.hidden = !v.open;
  column.size = v.max ? { weight: 1 } : { px: w };
  if (work) work.hidden = v.max;
  run("layout.set", { layout: root });
}

// Show the shown space's view by showing, hiding, selecting and resizing (no rewrite).
export function applyView(space = activeSpace()) {
  space = groupOf(space);
  const root = layout(), column = find(root, "pinned"), body = find(root, "pinned-body"), work = find(root, "work");
  if (!column || !space) return;
  const v = view(space), w = width(column);
  if (body && body.active !== v.body) run("layout.select", { stack: "pinned-body", child: v.body });
  for (const [id, shown, weight] of [["pinned-global", v.global, v.gWeight], ["pinned-body", v.own, v.ownWeight]]) {
    const node = find(root, id);
    if (!node) continue;
    if (Boolean(node.hidden) === shown) run(shown ? "layout.show" : "layout.hide", { id });
    if (node.size?.weight !== weight) run("layout.resize", { id, weight });
  }
  for (const p of visible(space)) {
    const id = cardId(p.terminal), node = find(root, id), hide = v.hidden.has(id);
    if (node && Boolean(node.hidden) !== hide) run(hide ? "layout.hide" : "layout.show", { id });
  }
  if (Boolean(column.size?.weight) !== v.max) run("layout.resize", v.max ? { id: "pinned", weight: 1 } : { id: "pinned", px: w });
  if (work && Boolean(work.hidden) !== v.max) run(v.max ? "layout.hide" : "layout.show", { id: "work" });
  if (Boolean(column.hidden) === v.open) run(v.open ? "layout.show" : "layout.hide", { id: "pinned" });
}

function save(bySpace) {
  setShared(KEY, bySpace);
  sync();
}

// Open or close the shown space's pinned view (closing also leaves maximised).
export function toggle(space = activeSpace()) {
  const open = !isOpen(space);
  put(OPEN, space, open);
  if (!open) put(MAX, space, false);
  applyView(space);
}

export function toggleMax(space = activeSpace()) {
  put(MAX, space, !isMax(space));
  put(OPEN, space, true);
  applyView(space);
}

// A pinned pane fills the view; again, they all show.
export function toggleZoom(terminal, space = activeSpace()) {
  put(ZOOM, space, zoomOf(space) === terminal ? null : terminal);
  applyView(space);
}

// Move the pane's terminal out of its tab into this space's pins (it keeps running and
// shows only here, so only here decides its size). Its space and tab are kept to put it
// back on unpin. Parking turns core keep off once the core replies; turn it back on.
export function pin(pane, cx) {
  const p = panes().find((x) => x.pane === pane);
  const space = activeSpace();
  if (!p?.terminal || !space || keyOf(p.terminal)) return;
  const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
  // Parking a tab's last pane would close the tab (and a space with no other tab): a fresh
  // shell takes its place first.
  if (panes().filter((x) => x.tab === p.tab).length === 1) run("pane.split", { pane, direction: "right" });
  run("terminal.park", { terminal: p.terminal });
  put(OPEN, space, true);
  save({ ...all(), [space]: [...list(space), { terminal: p.terminal, name, cwd: p.cwd, program: p.program, space: shownSpace(), tab: p.tab }] });
  keep(p.terminal, cx);
}

const info = async (terminal) => {
  const r = await exec("hc", ["get", terminal, "--json"]).catch(() => null);
  return r && JSON.parse(r.stdout || "null");
};

// Once the park has landed (its tab label gone), keep the terminal until keep stays on.
function keep(terminal, cx) {
  cx.spawn(async (cx) => {
    for (let i = 0, on = 0; i < 40 && on < 3; i++) {
      await cx.sleep(250);
      const t = await info(terminal);
      if (!t || t.state !== "live") return;
      if (t.labels?.["herdr.tab"]) continue;
      if (t.keep) on++;
      else { on = 0; await exec("hc", ["keep", terminal]).catch(() => null); }
    }
  });
}

// Take it out of the pins. One moved from a tab goes back to that tab (its labels put it
// there; a tab that's gone becomes a new one), one started here (split) into the shown tab,
// else (an adopted orphan) to a new tab of the shown space.
// That tab is then shown with the pane focused, as terminal.keep does (see reveal).
export function unpin(terminal, restore = true) {
  const pinned = Object.values(all()).flat().find((x) => x.terminal === terminal);
  const next = {};
  for (const [space, pins] of Object.entries(all())) {
    const kept = pins.filter((x) => x.terminal !== terminal);
    if (kept.length) next[space] = kept;
  }
  save(next);
  if (!restore || !pinned || panes().some((x) => x.terminal === terminal)) return;
  // One started here joins the shown tab (labelled with it, as one going back to its tab is). Its
  // "herdr.pinned=own" label goes too: Herdr reads herdr.pinned as an agent pinned to the top of the lists.
  const shown = spaces().find((s) => s.active), here = shown?.tabs.find((t) => t.active)?.id;
  const tab = pinned.own ? here : pinned.tab;
  const space = pinned.own ? shown?.id : pinned.space ?? shownSpace();
  if (!tab || !space) return run("terminal.keep", { terminal });
  // Labels hold ids local to the terminal's machine: drop the app's "<machine>/" prefix.
  const local = (id) => id.slice(id.indexOf("/") + 1);
  exec("hc", ["label", terminal, `herdr.space=${local(space)}`, `herdr.tab=${local(tab)}`, ...(pinned.own ? ["herdr.pinned="] : [])])
    .then(() => exec("hc", ["keep", terminal])).catch(() => run("terminal.keep", { terminal }));
  setShared(REVEAL, { terminal, until: Date.now() + 5000 });
}

// Show an unpinned terminal's tab and focus it once it has its pane back. panel-rail runs
// this on every render: the pinned header that asked is gone with its card, tasks and all.
export function reveal() {
  const want = shared(REVEAL);
  if (!want) return;
  if (Date.now() > want.until) return setShared(REVEAL, null);
  const pane = panes().find((x) => x.terminal === want.terminal);
  if (!pane) return;
  setShared(REVEAL, null);
  const space = spaces().find((s) => s.tabs?.some((t) => t.id === pane.tab));
  if (space && !space.active) run("space.select", { id: space.id });
  run("tab.select", { id: pane.tab });
  run("pane.focus", { pane: pane.pane });
}

// A shell of its own below the given pane, on that pane's machine, in its folder.
// No tab shows it while it's pinned; unpinned, it joins the shown tab (see unpin).
export function split(terminal, cwd, cx) {
  const space = activeSpace();
  const machine = terminal.includes("/") ? terminal.split("/")[0] : null;
  cx.spawn(async () => {
    const args = ["run", "--bg", "--keep", "--json", "--label", "herdr.pinned=own", ...(machine ? ["--on", machine] : []), ...(cwd ? ["--cwd", cwd] : [])];
    const r = await exec("hc", args).catch(() => null);
    const address = r && JSON.parse(r.stdout || "null")?.address;
    if (!address) return;
    const made = machine && !address.includes("/") ? `${machine}/${address}` : address;
    const key = keyOf(terminal) ?? space, pins = [...(all()[key] ?? [])];
    pins.splice(pins.findIndex((x) => x.terminal === terminal) + 1, 0, { terminal: made, name: "shell", cwd, own: true, space: shownSpace() });
    put(ZOOM, space, null);
    save({ ...all(), [key]: pins });
    run("pane.focus", { terminal: made });
  });
}

// Pinned panes are out of their tabs, so agents() leaves them out, and Herdr doesn't close their
// cards when they end. One poller (panel-rail, every 2 s) asks the core about each: one that ended
// (ctrl-d, exit, an agent quitting) is unpinned, its card gone; for the rest it keeps
// "pinned.agents" for the agent lists (my-agents, my-office) to add. No answer (hc failed) leaves it. The core knows working, blocked and idle; "done" (finished
// while you weren't looking) is worked out here, as Herdr does: until its pane has the keyboard.
export const pinnedAgents = () => shared(AGENTS) ?? [];

export function pollAgents(cx) {
  cx.spawn(async () => {
    const before = new Map(pinnedAgents().map((a) => [a.address, a]));
    const next = [];
    for (const [key, pins] of Object.entries(all())) {
      for (const p of pins) {
        // A pinned agent is listed under the space it came from (a group's pins can come from
        // its worktree spaces; a global pin's from anywhere).
        const space = p.space ?? (key === GLOBAL ? shownSpace() : key);
        const t = await info(p.terminal);
        if (t && t.state !== "live") { unpin(p.terminal, false); continue; }
        if (!t || !t.status?.state) continue;
        const looking = focused()?.terminal === p.terminal;
        const was = before.get(p.terminal)?.status;
        let status = t.status.state;
        if (status === "idle" && !looking && (was === "working" || was === "done")) status = "done";
        next.push({
          address: p.terminal, pane: null, space, space_name: spaces().find((s) => s.id === space)?.name ?? "",
          tab: `pinned-${space}`, tab_index: 0, tab_name: "Pinned", status, app: t.status.app ?? null,
          program: p.program ?? { name: p.name, icon: null }, title: t.title ?? p.name,
          seq: t.status_ms ?? 0, pinned: false, focused: looking,
        });
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(pinnedAgents())) setShared(AGENTS, next);
  });
}

// Go to a pinned terminal from elsewhere (an agent list's row): its card only shows in its own
// space's pinned view (a global pin's in every space), so select that space first, open the view
// (and drop a zoom on another card), then focus it. The blocks show once the layout applies, so
// focusing is tried again a moment later. Not pinned: plain pane.focus.
export function focusPinned(terminal, cx) {
  const key = keyOf(terminal);
  if (!key) return run("pane.focus", { terminal });
  const view = key === GLOBAL ? activeSpace() : key;
  if (key !== GLOBAL && activeSpace() !== key) {
    const pin = all()[key].find((x) => x.terminal === terminal);
    const to = spaces().find((s) => s.id === pin?.space && groupOf(s.id) === key) ?? spaces().find((s) => groupOf(s.id) === key);
    if (to) run("space.select", { id: to.id });
  }
  put(OPEN, view, true);
  if (zoomOf(view) && zoomOf(view) !== terminal) put(ZOOM, view, null);
  applyView(view);
  const go = () => { if (focused()?.terminal !== terminal) run("pane.focus", { terminal }); };
  go();
  if (cx?.timer) for (const ms of [120, 300]) cx.timer.after(ms, go);
}

// agents() plus the pinned agents, each after its space's others (so it joins that group).
export function withPinnedAgents(list) {
  list = [...list];
  for (const p of pinnedAgents()) {
    if (list.some((a) => a.address === p.address)) continue;
    const at = list.findLastIndex((a) => a.space === p.space);
    list.splice(at < 0 ? list.length : at + 1, 0, p);
  }
  return list;
}

// Pin across spaces, or back to only the space it was pinned from (else the shown one).
export function toggleGlobal(terminal) {
  const key = keyOf(terminal);
  if (!key) return;
  const pin = all()[key].find((x) => x.terminal === terminal);
  const home = spaces().some((s) => s.id === pin.space) ? groupOf(pin.space) : activeSpace();
  const to = key === GLOBAL ? home : GLOBAL;
  const next = { ...all(), [key]: all()[key].filter((x) => x.terminal !== terminal) };
  if (!next[key].length) delete next[key];
  next[to] = [...(next[to] ?? []), pin];
  save(next);
}

// Pins and view state kept under a worktree space's own id (from before it was known to be
// one) move to its group. panel-rail runs this on every render; it writes only when needed.
export function regroup() {
  const pins = all(), moved = Object.keys(pins).filter((k) => k !== GLOBAL && groupOf(k) !== k);
  if (moved.length) {
    const next = { ...pins };
    for (const k of moved) {
      const to = groupOf(k);
      next[to] = [...(next[to] ?? []), ...next[k].filter((x) => !(next[to] ?? []).some((y) => y.terminal === x.terminal))];
      delete next[k];
    }
    save(next);
  }
  for (const key of [OPEN, MAX, ZOOM]) {
    const m = map(key), stale = Object.keys(m).filter((k) => groupOf(k) !== k);
    if (!stale.length) continue;
    const next = { ...m };
    for (const k of stale) { next[groupOf(k)] ??= next[k]; delete next[k]; }
    setShared(key, next);
  }
}

// Closing a space's last pane or tab, or the space, would leave its pins nowhere to show: refuse
// with a notice while it has pins (a group's, only when no other space of the group stays).
// Global pins don't count. Called before pane.close {pane}, tab.close {tab}, space.close {space}
// (panel-rail's keys, my-pane's close button, my-menu). True when refused.
export function blocksClose({ pane, tab, space }) {
  if (pane) tab = panes().find((x) => x.pane === pane)?.tab;
  const s = spaces().find((x) => x.id === space || x.tabs.some((t) => t.id === tab));
  if (!s) return false;
  if (!space && (s.tabs.length > 1 || (pane && s.tabs[0].panes > 1))) return false;
  // A space's last pane or tab: closing it would close the space, which only closing the space
  // itself should do (the shell's exit / ctrl-d are guarded the same way, see ~/.zshrc).
  if (!space) {
    notify({ title: `Last ${pane ? "pane" : "tab"} in this space`, body: "Closing it would close the space. Close the space itself to remove it.", level: "warning" });
    return true;
  }
  const key = groupOf(s.id);
  if (!list(key).length || spaces().some((x) => x.id !== s.id && groupOf(x.id) === key)) return false;
  notify({ title: "This space has pinned terminals", body: "Unpin or close them first.", level: "warning" });
  return true;
}

// Reorder within a section (global or a space's): move a pin one place up or down, or swap
// two pins (a header dragged onto another, see my-pinned-panes). The pane keeps the keyboard.
export function move(terminal, by) {
  const key = keyOf(terminal), pins = [...(all()[key] ?? [])], i = pins.findIndex((x) => x.terminal === terminal);
  if (i < 0 || !pins[i + by]) return;
  swap(terminal, pins[i + by].terminal);
}
export function swap(a, b) {
  const key = keyOf(a), pins = [...(all()[key] ?? [])];
  const i = pins.findIndex((x) => x.terminal === a), j = pins.findIndex((x) => x.terminal === b);
  if (i < 0 || j < 0 || i === j) return;
  [pins[i], pins[j]] = [pins[j], pins[i]];
  const had = focused()?.terminal;
  save({ ...all(), [key]: pins });
  if (had === a || had === b) run("pane.focus", { terminal: had });
}

// Close a pinned pane: it ends, as closing a tab's pane would.
export function close(terminal) {
  unpin(terminal, false);
  run("terminal.kill", { terminal });
}
