// The right-click menu on a file in the Changes panel (mods/my-changes): its diff in nvim beside the
// pane (as Enter), or git difftool (as a double-click). props: { path, nvim, difftool, overlay };
// nvim/difftool false leave that item out (a remote space; a file git doesn't track yet).
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, run, closeOverlay } from "herdr";

const ITEMS = [
  ["diff", "nvim", "Open diff in terminal", "mods/files/file.svg"],
  ["difftool", "difftool", "Open in git difftool", "mods/changes/changes.svg"],
];

export default class ChangesMenu extends View {
  choose(action) {
    const { path, overlay } = props() ?? {};
    closeOverlay(overlay);
    run(`my-changes.${action}:${path}`);
  }

  render() {
    const t = theme(), p = props() ?? {};
    return v_flex().id("changes-menu").w_full().p(5).bg(t.popover).text_size(12.8)
      .child(div().px(8).pt(4).pb(5).text_size(11).text_color(t.dim).truncate().child(p.path?.split("/").pop() ?? ""))
      .children(ITEMS.filter(([, when]) => p[when] !== false).map(([action, , text, icon]) =>
        h_flex().id(`changes-menu-${action}`).h(31).px(8).gap(9).rounded(7).items_center().text_color(t.foreground)
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.choose(action))
          .child(svg(icon).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().child(text))));
  }
}
