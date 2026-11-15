import { Archive, MoreHorizontal, Plus, Star, StarOff, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { NoteIndexItem } from "@research-assistant/core/notes";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { PageLinkBlock } from "@research-assistant/workbench-sdk/note-documents";
import type { NoteFavoriteAction } from "./noteFavoriteActions";

export function NoteIndexRow({ item, leading, disabled, onOpen, onAction, onAddInside }: {
  readonly item: NoteIndexItem; readonly leading?: ReactNode; readonly disabled: boolean;
  readonly onOpen: (pin: boolean) => void; readonly onAction: (action: NoteFavoriteAction) => void;
  readonly onAddInside?: () => void;
}): React.JSX.Element {
  return <>
    {leading}
    <PageLinkBlock appearance="plain" title={item.title} onOpen={() => onOpen(false)} onPin={() => onOpen(true)} onKeyDown={event=>{
      if(disabled||item.target.kind==="writing"||event.nativeEvent.isComposing||event.metaKey||event.ctrlKey||event.altKey||!["Delete","Backspace"].includes(event.key))return;
      event.preventDefault();event.stopPropagation();onAction("trash");
    }}/>
    <div className="note-favorite-row-actions">
      {onAddInside && <ControlHint content="在笔记内部添加新页面"><button type="button" className="note-favorite-icon-button" aria-label={`在${item.title}内部添加新页面`} disabled={disabled} onClick={onAddInside}><Plus size={15} /></button></ControlHint>}
      {item.target.kind !== "writing" && <ActionMenu hint portal className="note-favorite-menu" triggerClassName="note-favorite-icon-button" contentClassName="note-page-action-menu" label={`${item.title}的更多操作`} disabled={disabled} trigger={<MoreHorizontal size={16} />}>
        {item.category === "independent" && <ActionMenuItem onClick={() => onAction(item.isFavorite ? "unfavorite" : "favorite")}>{item.isFavorite ? <StarOff size={15} /> : <Star size={15} />}{item.isFavorite ? "取消收藏" : "收藏"}</ActionMenuItem>}
        <ActionMenuItem onClick={() => onAction("archive")}><Archive size={15} />归档</ActionMenuItem>
        <ActionMenuItem className="danger-text" onClick={() => onAction("trash")}><Trash2 size={15} />删除</ActionMenuItem>
      </ActionMenu>}
    </div>
  </>;
}
