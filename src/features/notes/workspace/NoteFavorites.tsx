import type { CSSProperties } from "react";
import type { NoteIndexItem } from "@research-assistant/core/notes";
import { ChevronRight } from "lucide-react";
import { ReorderGroup, ReorderItem } from "@research-assistant/workbench-sdk/reorder";
import { usePointerReorder, type ReorderDrop } from "@research-assistant/workbench-sdk/reorder";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { NoteIndexRow } from "./NoteIndexRow";
import type { NoteFavoriteAction } from "./noteFavoriteActions";
import { useFavoritePageTree } from "./useFavoritePageTree";
import { moveFavoriteLink } from "./noteNavigationActions";

export function NoteFavorites({ items, selectedPageId, onOpen, onReorder, disabled, onAddInside, onAction }: {
  readonly onAddInside: (item: NoteIndexItem) => void;
  readonly onAction: (item: NoteIndexItem, action: NoteFavoriteAction) => void;
  readonly items: readonly NoteIndexItem[]; readonly selectedPageId: string | undefined;
  readonly onOpen: (item: NoteIndexItem, pin: boolean) => void;
  readonly onReorder: (ids: readonly string[]) => Promise<void>; readonly disabled: boolean;
}): React.JSX.Element {
  const tree = useFavoritePageTree(items), rows = tree.rows;
  const byId = new Map(rows.map(row => [row.id, row]));
  const canDrop = ({ source, target, placement }: ReorderDrop) => {
    const from = byId.get(source)!, to = byId.get(target)!;
    if (from.link?.legacy || target.startsWith(`${source}/`) || to.item.status !== "active" || to.cycle) return false;
    if (placement === "inside" && to.item.target.kind !== "writing" && to.item.target.pageId === (from.item.target.kind !== "writing" ? from.item.target.pageId : undefined)) return false;
    return true;
  };
  async function drop(change: ReorderDrop): Promise<void> {
    const source = byId.get(change.source)!, target = byId.get(change.target)!;
    if (source.item.target.kind === "writing" || target.item.target.kind === "writing" || !canDrop(change)) return;
    if (!source.parentId && !target.parentId && change.placement !== "inside") {
      const order = items.map(item => item.id).filter(id => id !== source.id);
      order.splice(order.indexOf(target.id) + (change.placement === "after" ? 1 : 0), 0, source.id); await onReorder(order); return;
    }
    const destination = change.placement === "inside" ? { pageId: target.item.target.pageId, placement: "inside" as const }
      : target.parentPageId && target.link ? { pageId: target.parentPageId, anchorBlockId: target.link.blockId, placement: change.placement } : undefined;
    await moveFavoriteLink(tree.client, {
      source: { pageId: source.item.target.pageId, title: source.item.title, ...(source.parentPageId && source.link ? { parentPageId: source.parentPageId, blockId: source.link.blockId } : {}) },
      ...(destination ? { destination } : { rootAnchorId: target.item.target.pageId, rootAfter: change.placement === "after" }),
    });
    if (change.placement === "inside" && !target.expanded) tree.toggle(target.id);
  }
  const reorder = usePointerReorder({ ids: rows.map(row => row.id), presentation: "indicator", disabled,
    treeItem: id => ({ depth: byId.get(id)!.depth, ...(byId.get(id)!.parentId ? { parentId: byId.get(id)!.parentId! } : {}), canNest: !byId.get(id)!.cycle }),
    canDrop, onDrop: drop });
  const dropTarget = reorder.drag ? byId.get(reorder.drag.target) : undefined;
  const indicatorId = dropTarget && reorder.drag?.placement === "after"
    ? rows.filter(row => row.id === dropTarget.id || row.id.startsWith(`${dropTarget.id}/`)).at(-1)?.id : dropTarget?.id;
  return <ReorderGroup motion="none" className="note-favorites-list note-navigation-tree" aria-label="收藏笔记" order={rows.map(row => row.id)} dragging={!!reorder.drag}>
    {rows.map(row => {
      const pageId = row.item.target.kind === "writing" ? undefined : row.item.target.pageId;
      const page = pageId ? tree.loaded.get(pageId) : undefined;
      const placement = indicatorId === row.id ? reorder.drag?.placement : undefined;
      return <div key={row.id}>
        <ReorderItem itemId={row.id} className="note-favorites-row" aria-current={pageId === selectedPageId ? "page" : undefined}
          style={{ paddingLeft: row.depth * 18, "--note-tree-indent": `${(placement ? dropTarget?.depth ?? row.depth : row.depth) * 18}px` } as CSSProperties} data-drop-placement={placement} data-depth={row.depth}
          ref={element => { if (element) reorder.rows.current.set(row.id, element); else reorder.rows.current.delete(row.id); }}
          onPointerDown={event => {
            if ((event.target as HTMLElement).closest('button:not([role="link"]), [role="menuitem"]')) return;
            if (!row.link?.legacy) reorder.start(row.id, event);
          }}
          onKeyDown={event => {
            if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const siblings = rows.filter(value => value.parentId === row.parentId), index = siblings.indexOf(row);
            const next = siblings[index + (event.key === "ArrowUp" ? -1 : 1)];
            if (next) void drop({ source: row.id, target: next.id, placement: event.key === "ArrowUp" ? "before" : "after" }).catch(reason => notify.error(String(reason)));
          }}>
          <NoteIndexRow item={row.item} disabled={disabled || reorder.pending} onOpen={pin => { if (!reorder.consumeClick()) onOpen(row.item, pin); }} onAddInside={() => onAddInside(row.item)} onAction={action => onAction(row.item, action)}
            leading={row.hasPageLinks ? <button type="button" className="note-favorite-toggle" aria-label={`${row.expanded ? "折叠" : "展开"}${row.item.title}中的页面链接`} aria-expanded={row.expanded} disabled={row.cycle || row.depth >= 32} onClick={() => tree.toggle(row.id)}><ChevronRight size={14} /></button> : <span className="note-favorite-toggle-spacer" aria-hidden="true" />} />
        </ReorderItem>
        {(page?.error || row.expanded && !page?.snapshot) && <div className="note-tree-feedback" role="status">{page?.error ? <><span>{page.error}</span><button type="button" onClick={tree.retry}>重试</button></> : "正在读取页面链接…"}</div>}
      </div>;
    })}
  </ReorderGroup>;
}
