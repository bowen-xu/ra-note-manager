import type {NoteIndexItem} from "@research-assistant/core/notes";
import {NotesGatewayError, type NotesErrorCode} from "@research-assistant/data/notes";
import type {NoteResourceAccess} from "@research-assistant/workbench-sdk/note-resources";
import {commitNoteMetadata} from "@research-assistant/workbench-sdk/note-resources";
import {notify} from "@research-assistant/workbench-sdk/feedback";
import {noteBulkDisabledReason, type NoteBulkAction, type NoteBulkResult} from "./noteBulkActions";
export {applyNotePageStatus, publishNoteMetadataReceipt} from "@research-assistant/workbench-sdk/note-resources";
export {NOTE_METADATA_CHANGED, NOTE_PAGES_DELETED} from "@research-assistant/workbench-sdk/note-documents";
export type {NoteMetadataChanged} from "@research-assistant/workbench-sdk/note-documents";
export type NoteFavoriteAction = "favorite" | "unfavorite" | "archive" | "trash";

/** Single-row and bulk commands share the same metadata-only transaction. */
export async function applyFavoriteAction(client: NoteResourceAccess, item: NoteIndexItem, action: NoteFavoriteAction): Promise<void> {
  const result = await applyNoteBulkAction(client, [item], action);
  if (result.warnings?.length) notify.error(result.warnings.join("；"));
  const failure = result.failures[0];
  if (failure) throw new NotesGatewayError(failure.code ?? "operation_unknown", failure.message, failure.currentRevision);
}

export async function applyNoteBulkAction(client: NoteResourceAccess, items: readonly NoteIndexItem[], action: NoteBulkAction): Promise<NoteBulkResult> {
  const reason = noteBulkDisabledReason(items, action);
  if (reason) throw new NotesGatewayError("invalid_input", reason);
  const targets = new Map(items.flatMap(item => item.target.kind === "writing" ? [] : [[item.target.pageId, item] as const]));
  const {receipt, warnings} = await commitNoteMetadata(client, [...targets.keys()], action);
  return {succeededIds: receipt.succeededIds.map(id => targets.get(id)!.id), ...(warnings.length ? {warnings} : {}), failures: receipt.failures.map(failure => ({
    id: targets.get(failure.id)!.id, title: targets.get(failure.id)!.title || "无标题",
    message: `${failure.code}: ${failure.message}${failure.currentRevision === undefined ? "" : `（当前修订 ${failure.currentRevision}）`}`,
    code: failure.code as NotesErrorCode, ...(failure.currentRevision === undefined ? {} : {currentRevision: failure.currentRevision}),
  }))};
}
