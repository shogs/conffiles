// Goes back to the tab shown before this one, in whichever space, like tmux's last-window:
// pressed again, it returns. `last-tab.go` from keys.json. Lives in a floating block and
// draws nothing; it notes the shown tab whenever Herdr's live data changes, except while the
// Spaces sidebar browses (shared "spaces.browsing"): only the tab entered from there counts.
import { View, div } from "gpui-kit";
import { spaces, run, nextCommand, shared } from "herdr";

export default class LastTab extends View {
  init(_props, cx) {
    this.current = null;
    this.previous = null;
    cx.spawn(async (cx) => {
      for (;;) {
        const command = String(await nextCommand()).replace(/^last-tab\./, "");
        if (command === "go") this.go();
      }
    });
  }

  track() {
    if (shared("spaces.browsing")) return;
    const space = spaces().find((s) => s.active), tab = space?.tabs.find((t) => t.active);
    if (!tab || this.current?.tab === tab.id) return;
    this.previous = this.current;
    this.current = { space: space.id, tab: tab.id };
  }

  go() {
    this.track();
    const p = this.previous;
    // Closed since: nothing to go back to.
    if (!p || !spaces().some((s) => s.tabs.some((t) => t.id === p.tab))) { this.previous = null; return; }
    run("space.select", { id: p.space });
    run("tab.select", { id: p.tab });
  }

  render() {
    this.track();
    return div();
  }
}
