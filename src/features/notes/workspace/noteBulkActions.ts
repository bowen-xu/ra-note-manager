import type { NoteIndexItem } from "@research-assistant/core/notes";
import type { NoteFavoriteAction } from "./noteFavoriteActions";

export type NoteBulkAction = NoteFavoriteAction | "restore";
export interface NoteBulkResult {
  readonly succeededIds: readonly string[];
  readonly warnings?: readonly string[];
  readonly failures: readonly { readonly id: string; readonly title: string; readonly message: string; readonly code?: import("@research-assistant/data/notes").NotesErrorCode; readonly currentRevision?: number }[];
}
export const NOTE_BULK_LABELS: Record<NoteBulkAction, string> = {favorite: "收藏", unfavorite: "取消收藏", archive: "归档", restore: "恢复笔记", trash: "移到回收站"};

export function noteBulkDisabledReason(items: readonly NoteIndexItem[], action: NoteBulkAction): string | undefined {
  if (!items.length) return "请先选择笔记";
  if (items.some(item => item.target.kind === "writing")) return "所选包含写作项目笔记，请在写作项目中管理";
  if ((action === "favorite" || action === "unfavorite") && items.some(item => item.category !== "independent")) return "附属笔记不支持收藏";
  if ((action === "favorite" || action === "unfavorite") && items.some(item => item.status !== "active")) return "请先恢复所选笔记，再调整收藏";
  if (action !== "restore" && items.some(item => item.status === "trashed")) return "请先恢复回收站中的笔记";
  return undefined;
}
