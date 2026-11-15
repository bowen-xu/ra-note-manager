import { Archive, MoreHorizontal, RotateCcw, Star, StarOff, Trash2 } from "lucide-react";
import type { NoteIndexItem } from "@research-assistant/core/notes";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { NOTE_BULK_LABELS, noteBulkDisabledReason, type NoteBulkAction } from "./noteBulkActions";

export function NoteLibraryBulkBar({items, busy, onClear, onApply}: {
  readonly items: readonly NoteIndexItem[]; readonly busy: boolean;
  readonly onClear: () => void; readonly onApply: (action: NoteBulkAction) => void;
}): React.JSX.Element {
  const trashReason = noteBulkDisabledReason(items, "trash");
  return <div className="notes-library-selection" role="toolbar" aria-label="所选笔记批量操作">
    <ControlHint content="取消选择"><button type="button" className="notes-library-selection-count" aria-label="取消选择" disabled={busy} onClick={onClear}>已选 {items.length} 项</button></ControlHint>
    <ControlHint content={trashReason ?? "移到回收站"}><span><button type="button" aria-label="删除所选笔记" disabled={busy || !!trashReason} onClick={() => onApply("trash")}><Trash2 size={18} /></button></span></ControlHint>
    <ActionMenu label="所选笔记的更多操作" hint portal className="notes-library-bulk-menu" contentClassName="note-page-action-menu" disabled={busy} trigger={<MoreHorizontal size={18} />}>
      {(["favorite", "unfavorite", "archive", ...(items.some(item => item.status !== "active") ? ["restore" as const] : [])] as const).map(action => {
        const reason = noteBulkDisabledReason(items, action);
        const Icon = action === "favorite" ? Star : action === "unfavorite" ? StarOff : action === "restore" ? RotateCcw : Archive;
        return <ControlHint key={action} content={reason ?? NOTE_BULK_LABELS[action]}><span><ActionMenuItem disabled={!!reason} onClick={() => onApply(action)}><Icon size={16} />{NOTE_BULK_LABELS[action]}</ActionMenuItem></span></ControlHint>;
      })}
    </ActionMenu>
  </div>;
}
