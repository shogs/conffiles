// The side panel's buttons as a strip down the window's right edge: an icon and a
// sideways label per panel (Files, Changes). Click to show that panel, again to hide it.
// Like the tab bar it replaces, it remembers each space's panel and restores it on switching.
// panel-rail.files and panel-rail.changes (keys) open that panel and give it the keyboard.
import { View, div, svg, image } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, run, theme, shared, layout, nextCommand } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The labels are pictures (no rotated text in mods), drawn at half their pixel size.
const PANELS = [
  { id: "files", icon: "mods/files/file.svg", label: "files", w: 9, h: 23 },
  { id: "changes", icon: "mods/changes/changes.svg", label: "changes", w: 11, h: 47 },
];

export default class PanelRail extends View {
  init(_props, cx) {
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    cx.spawn(async (cx) => {
      for (;;) {
        const command = String(await nextCommand()).replace(/^panel-rail\./, "");
        if (command === "files") this.focusPanel("files", "my-files", cx);
        else if (command === "changes") this.focusPanel("changes", "my-changes", cx);
      }
    });
  }

  open(id) {
    run("layout.select", { stack: "panel-body", child: id });
    run("layout.show", { id: "panel" });
  }

  // A hidden panel's mod takes no commands: show it, then ask it for the keyboard until it has started.
  focusPanel(id, mod, cx) {
    this.open(id);
    for (const ms of [0, 120, 300]) cx.timer.after(ms, () => run(`${mod}.focus`));
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(spaces().find(s => s.active), panel, body, enabled);
    const button = (p) => {
      const on = panel && !panel.hidden && body?.active === p.id;
      return v_flex().id(`rail-${p.id}`).w(30).py(10).gap(8).flex_none().items_center().rounded(7)
        .bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: p.id }); run("layout.show", { id: "panel" }); }
        })
        .child(svg(p.icon).size(14))
        .child(image(`mods/panel-rail/label-${p.label}${on ? "-on" : ""}.png`).w(p.w).h(p.h));
    };
    return v_flex().size_full().pt(10).gap(6).items_center().bg(t.chrome)
      .children(PANELS.filter(p => enabled.includes(p.id)).map(button));
  }
}
