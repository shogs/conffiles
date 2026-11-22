// The right-click menu on a file in the Files panel (mods/my-files): open it in nvim in a new pane
// beside the focused one (as Enter), or preview it in the panel. props: { path, overlay }.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, run, closeOverlay } from "herdr";

const ITEMS = [
  ["nvim", "Open in Neovim", "mods/my-files/file.svg"],
  ["preview", "Preview in Files", "mods/my-files/chevron-right.svg"],
];

export default class FilesMenu extends View {
  choose(action) {
    const { path, overlay } = props() ?? {};
    closeOverlay(overlay);
    run(`my-files.${action}:${path}`);
  }

  render() {
    const t = theme(), { path } = props() ?? {};
    return v_flex().id("files-menu").w_full().p(5).bg(t.popover).text_size(12.8)
      .child(div().px(8).pt(4).pb(5).text_size(11).text_color(t.dim).truncate().child(path?.split("/").pop() ?? ""))
      .children(ITEMS.map(([action, text, icon]) =>
        h_flex().id(`files-menu-${action}`).h(31).px(8).gap(9).rounded(7).items_center().text_color(t.foreground)
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.choose(action))
          .child(svg(icon).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().child(text))));
  }
}
