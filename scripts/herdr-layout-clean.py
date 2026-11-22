#!/usr/bin/env python3
"""Git clean filter for Herdr layouts: strips per-space pinned-pane state.

The my-pinned-panes mod rewrites the layout (layout.set) on every pin, unpin,
split, move and close, baking in one `pinned-sp-<space id>` column per space
and one card per pinned terminal. This filter resets the "pinned" column to
the state that mod produces with nothing pinned, so git only stores the design.
The file on disk keeps its real pins.

Reads the layout on stdin, writes the cleaned layout on stdout.

Setup (once per clone; .gitattributes maps the layouts to this filter):
    git config filter.herdr-layout.clean 'python3 -I scripts/herdr-layout-clean.py'
    git config filter.herdr-layout.required true
"""
import json
import re
import sys

DEFAULT_PINNED_WIDTH = 460  # width() fallback in mods/my-pinned-panes/pins.js


def find(node, node_id):
    if not isinstance(node, dict):
        return None
    if node.get("id") == node_id:
        return node
    for child in node.get("children", []):
        found = find(child, node_id)
        if found:
            return found
    return None


def clean(layout):
    column = find(layout, "pinned")
    if not column:
        return layout

    # Closed column. A maximised column has a weight; give it back a width.
    column["hidden"] = True
    if "weight" in column.get("size", {}):
        column["size"] = {"px": DEFAULT_PINNED_WIDTH}

    work = find(layout, "work")
    if work:
        work.pop("hidden", None)

    orphans = find(column, "pinned-orphans")
    if orphans:
        orphans["hidden"] = True

    pinned_global = find(column, "pinned-global")
    if pinned_global:
        pinned_global["hidden"] = True
        pinned_global["size"] = {"weight": 1}
        if "children" in pinned_global:
            pinned_global["children"] = []

    body = find(column, "pinned-body")
    if body:
        body["active"] = "pinned-empty"
        body["size"] = {"weight": 1}
        body.pop("hidden", None)
        body["children"] = [
            c for c in body.get("children", []) if c.get("id") == "pinned-empty"
        ]

    return layout


def main():
    text = sys.stdin.read()
    try:
        layout = json.loads(text)
    except ValueError:
        # Not JSON (mid-edit, or not a layout): store as-is rather than fail the add.
        sys.stdout.write(text)
        return

    out = json.dumps(clean(layout), indent=2, ensure_ascii=False) + "\n"
    leftover = sorted(set(re.findall(r"\bsp[0-9a-f]{32}\b", out)))
    if leftover:
        print(
            "herdr-layout-clean: space ids still in layout: " + ", ".join(leftover),
            file=sys.stderr,
        )
    sys.stdout.write(out)


if __name__ == "__main__":
    main()
