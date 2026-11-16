// The pinned view's pieces (pins.js builds the view and keeps its state):
//   props {title: true}   the view's title row: "Pinned", count, maximise, hide
//   props {terminal}      a pinned pane's header, like my-pane's: icon, name, folder,
//                         status; pin across spaces (the sideways pin), pin (unpin); on
//                         hover split down, zoom, close; dragged onto another, swaps the two
//   props {orphans: true} pins whose space closed (pins.js orphans), in every space: pin here,
//                         open as a tab, or kill
//   props {}              the empty view's hint
// (The frame's side and bottom strips are my-pinned-frame.)
//
// pane.go: the mod is focusable, so pane.go reaches these copies. One that gets "focus" hands
// the keyboard on, to the pinned pane used last (else a header to its own, the title to the
// first); the hint keeps it. From a pinned pane (a layout terminal block, where pane.go fails) panel-rail moves.
// The view opens and closes with the sidebar's pin button and ctrl-a/ctrl-s i.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, run, theme, home, terminals, agents, focused, nextCommand, shared, setShared } from "herdr";
import { all, visible, unpin, close, split, toggle, toggleMax, toggleZoom, zoomOf, isMax, isGlobal, toggleGlobal, orphans, adopt, openAsTab, swap } from "./pins.js";

// Dragging a header onto another swaps the two pins (same section only). There are no drag
// events across mods, so a press on a header remembers it (shared "pinned.drag"), and a release
// on another header of its section swaps them. A release elsewhere leaves it until the next press,
// so the drop target's outline only shows for a few seconds after the press.
const DRAG = "pinned.drag";
const dragging = () => { const d = shared(DRAG); return d && Date.now() - d.at < 8000 ? d.terminal : null; };
const section = (terminal) => Object.keys(all()).find((k) => all()[k].some((x) => x.terminal === terminal));

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class PinnedPanes extends View {
  init(props, cx) {
    this.hovered = false;
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      for (;;) {
        const command = String(await nextCommand()).replace(/^my-pinned-panes\./, "");
        cx.notify(); // a reloaded build's loop ends here instead of acting too
        this.command(command, cx);
      }
    });
  }

  command(command, cx) {
    const p = props() ?? {};
    if (command === "focus") {
      // Coming in: the pinned pane used last, as pane.go prefers; else this header's, or the first.
      const shown = visible().filter((x) => !this.zoomedOut(x.terminal)), last = shared("pinned.last");
      const to = shown.some((x) => x.terminal === last) ? last : p.terminal ?? (p.title ? shown[0]?.terminal : null);
      if (to) run("pane.focus", { terminal: to });
      else this.handle.focus();
    }
  }

  // Hidden by another pinned pane's zoom.
  zoomedOut(terminal) {
    const z = zoomOf();
    return Boolean(z) && z !== terminal;
  }

  button(t, id, path, title, action) {
    return div().id(id).p(3).rounded(4).flex_none().text_color(t.dim).tooltip(title)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); action(cx); })
      .child(svg(path).size(14));
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    if (p.title) {
      const max = isMax();
      return h_flex().id("pinned-title").track_focus(this.handle).size_full().px(10).gap(8).items_center().text_size(12)
        .child(svg("mods/my-workspace-chrome/pin.svg").size(13).text_color(t.muted))
        .child(div().font_semibold().text_color(t.foreground).child("Pinned"))
        .child(div().flex_1().text_color(t.dim).child(String(visible().length || "")))
        .child(this.button(t, "pinned-max", `mods/my-pane/${max ? "unzoom" : "zoom"}.svg`, max ? "Restore" : "Maximise", () => toggleMax()))
        .child(this.button(t, "pinned-hide", "mods/my-workspace-chrome/x.svg", "Hide (ctrl-a i)", () => toggle()));
    }
    if (p.orphans) {
      const lost = orphans();
      return v_flex().id("pinned-orphans").size_full().px(4).text_size(12)
        .child(h_flex().h(30).px(6).gap(8).items_center().flex_none()
          .child(svg("mods/my-workspace-chrome/pin-off.svg").size(13).text_color(t.ansi3))
          .child(div().font_semibold().text_color(t.foreground).child("From closed spaces"))
          .child(div().text_color(t.dim).child(String(lost.length))))
        .children(lost.map((x) => {
          const pic = icon(x.program, 14, t.dim);
          return h_flex().id(`orphan-${x.terminal}`).h(28).px(6).gap(8).items_center().flex_none().rounded(6)
            .hover((s) => s.bg(t.hover))
            .when(Boolean(pic), (el) => el.child(pic))
            .child(div().flex_none().truncate().max_w(180).text_color(t.foreground).child(x.name || x.terminal))
            .child(div().flex_1().truncate().text_color(t.dim).child(folder(x.cwd)))
            .child(this.button(t, `orphan-adopt-${x.terminal}`, "mods/my-workspace-chrome/pin.svg", "Pin to this space", () => adopt(x.terminal)))
            .child(this.button(t, `orphan-tab-${x.terminal}`, "mods/workspace-chrome/terminal.svg", "Open as a tab here", () => openAsTab(x.terminal)))
            .child(this.button(t, `orphan-kill-${x.terminal}`, "mods/my-pane/close.svg", "Kill", () => close(x.terminal)));
        }));
    }
    if (!p.terminal) {
      return v_flex().id("pinned-empty").track_focus(this.handle).size_full().p(16).gap(6).items_center().justify_center().text_size(12).text_color(t.dim)
        .child(svg("mods/my-workspace-chrome/pin.svg").size(18))
        .child("No pinned panes in this space")
        .child(div().text_size(11).child("Pin one from its header"));
    }
    const terminal = p.terminal;
    const f = focused(), selected = f?.terminal === terminal && !f?.pane;
    const frame = selected ? t.accent : t.border;
    const pin = Object.values(all()).flat().find((x) => x.terminal === terminal);
    const global = isGlobal(terminal);
    const live = terminals().find((x) => x.address === terminal);
    const agent = agents().find((a) => a.address === terminal);
    const program = agent?.program ?? live?.program ?? pin?.program;
    const name = ((program?.agent || program?.shell) && program.name) || live?.title || program?.name || pin?.name || terminal;
    const pic = icon(program, 14, t.dim);
    const st = agent?.status;
    const zoomed = zoomOf() === terminal;
    const from = dragging(), target = this.hovered && from && from !== terminal && section(from) === section(terminal);
    return h_flex().id(`pinned-head-${terminal}`).track_focus(this.handle).size_full().px(10).gap(8).items_center()
      .relative().bg(target ? t.selected : t.background).rounded_t(10).border_t(1).border_x(1).border_color(target ? t.accent : frame).text_size(12)
      .when(Boolean(from), (el) => el.cursor_grabbing())
      .on_mouse_down("left", () => setShared(DRAG, { terminal, at: Date.now() }))
      .on_mouse_up("left", () => {
        const a = dragging();
        if (!a) return;
        setShared(DRAG, null);
        if (a !== terminal && section(a) === section(terminal)) swap(a, terminal);
      })
      // The line under the title stays the plain divider, as on a tab's pane.
      .child(div().absolute().bottom(0).left(0).right(0).h(1).bg(t.border))
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { terminal }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(live?.cwd ?? pin?.cwd)))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .child(this.button(t, `pinned-global-${terminal}`, "mods/my-pinned-panes/pin-global.svg", global ? "Pinned to all spaces: pin to this space only" : "Pin to all spaces", () => toggleGlobal(terminal))
        // Yellow, so a pin across spaces stands apart from the accent pin of this space's.
        .when(global, b => b.text_color(t.ansi3)))
      .when(!pin?.own, el => el.child(this.button(t, `pinned-unpin-${terminal}`, "mods/my-pane/pin.svg", "Unpin (back to its tab)", () => unpin(terminal)).text_color(t.accent)))
      .when(this.hovered, el => el
        .child(this.button(t, `pinned-split-${terminal}`, "mods/my-pane/split-down.svg", "Split down", (cx) => split(terminal, live?.cwd ?? pin?.cwd, cx)))
        .child(this.button(t, `pinned-zoom-${terminal}`, `mods/my-pane/${zoomed ? "unzoom" : "zoom"}.svg`, zoomed ? "Show all" : "Zoom", () => toggleZoom(terminal)))
        .child(this.button(t, `pinned-close-${terminal}`, "mods/my-pane/close.svg", "Close", () => close(terminal))));
  }
}
