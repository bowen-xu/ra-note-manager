import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { memo } from "react";
import type { NoteIndexItem } from "@research-assistant/core/notes";
import { NoteIndexRow } from "./NoteIndexRow";
import type { NoteFavoriteAction } from "./noteFavoriteActions";

const editedDate = new Intl.DateTimeFormat("zh-CN", {year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"});

/** A selection update changes only affected rows; menus and date formatting on
 * the remaining mounted rows keep their existing render and overlay identity.
 */
export const NoteLibraryRow = memo(function NoteLibraryRow({item, index, selected, busy, loading, searching, onChoose, onOpen, onAction}: {
  readonly item: NoteIndexItem; readonly index: number; readonly selected: boolean;
  readonly busy: boolean; readonly loading: boolean; readonly searching: boolean;
  readonly onChoose: (id: string, toggle: boolean, range: boolean) => void;
  readonly onOpen: (item: NoteIndexItem, pin: boolean) => void;
  readonly onAction: (item: NoteIndexItem, action: NoteFavoriteAction) => void;
}): React.JSX.Element {
  return <tr data-selection-id={item.id} aria-rowindex={index + 2} aria-selected={selected} onClick={event => {
    if (busy || event.target instanceof Element && event.target.closest('a, button, input, [role="link"], [role="button"]')) return;
    onChoose(item.id, event.ctrlKey || event.metaKey, event.shiftKey);
  }}>
    <td className="notes-library-select"><input type="checkbox" aria-label={`选择笔记：${item.title || "无标题"}`} checked={selected} disabled={busy || loading} onChange={event => onChoose(item.id, true, event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey)} /></td>
    <td><div className="note-favorites-row"><NoteIndexRow item={item} disabled={busy || loading} onOpen={pin => { if (!busy) onOpen(item, pin); }} onAction={action => onAction(item, action)} /></div>{searching && item.snippet && <p className="notes-library-snippet">{item.snippet}</p>}</td>
    <td className="notes-library-kind">{item.category === "independent" ? "独立笔记" : "附属笔记"}{item.status === "archived" ? " · 已归档" : ""}</td>
    <td className="notes-library-source"><ControlHint content={item.owner?.label ?? item.sourceLabel}><span>{item.owner?.label ?? item.sourceLabel ?? "—"}</span></ControlHint></td>
    <td className="notes-library-edited">{Number.isNaN(Date.parse(item.updatedAt)) ? "—" : <time dateTime={item.updatedAt}>{editedDate.format(new Date(item.updatedAt))}</time>}</td>
  </tr>;
});
