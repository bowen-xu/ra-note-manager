import { moveNavigationLink, type NavigationLinkSource, type NavigationLinkDestination, type NotePageId } from "@research-assistant/core/notes";
import { NotesGatewayError } from "@research-assistant/data/notes";
import type { NoteResourceAccess } from "@research-assistant/workbench-sdk/note-resources";
import { getReaderCloseCoordinator } from "@research-assistant/workbench-sdk/workbench";
import { getNoteReviewSaveState, holdTextEditor, isTextEditorHeld, synchronizeNoteReview } from "@research-assistant/workbench-sdk/note-documents";
import { prepareNavigationSessions } from "@research-assistant/workbench-sdk/note-documents";

export interface NoteNavigationMove {
  readonly source: NavigationLinkSource;
  readonly destination?: NavigationLinkDestination;
  readonly rootAnchorId?: NotePageId;
  readonly rootAfter?: boolean;
}
/** Body links and favorites share one durable transaction; never delete the
 * source first and hope a second destination write succeeds. */
export async function moveFavoriteLink(client: NoteResourceAccess, move: NoteNavigationMove): Promise<void> {
  if (!await getReaderCloseCoordinator().prepareAll()) throw new Error("请先保存或解决冲突，再移动页面链接。");
  const ids = [...new Set([move.source.pageId, move.source.parentPageId, move.destination?.pageId].filter((id): id is NotePageId => !!id))];
  if (ids.some(id => isTextEditorHeld(id) || getNoteReviewSaveState(id).pendingChanges)) throw new Error("笔记正在修改或待审阅，请完成后重试。");
  const operation = crypto.randomUUID();
  ids.forEach(id => holdTextEditor(id, operation, true));
  const prepared: ReturnType<typeof prepareNavigationSessions>[] = [];
  let dispatched = false;
  try {
    const snapshots = await Promise.all(ids.map(id => client.gateway.loadDocument(id)));
    const documents = new Map(snapshots.map(snapshot => [snapshot.page.id, snapshot.document]));
    const changed = moveNavigationLink(documents, move.source, move.destination, crypto.randomUUID());
    const previous = await client.gateway.listFavoritePageIds();
    const favorites = previous.filter(id => id !== move.source.pageId || !!move.source.parentPageId && !!move.destination);
    if (!move.destination) {
      const index = move.rootAnchorId ? favorites.indexOf(move.rootAnchorId) : favorites.length;
      favorites.splice(index < 0 ? favorites.length : index + (move.rootAfter ? 1 : 0), 0, move.source.pageId);
    }
    for (const before of snapshots) {
      const after = changed.find(document => document.pageId === before.page.id);
      const membershipChanged = previous.includes(before.page.id) !== favorites.includes(before.page.id);
      if (after || membershipChanged) prepared.push(prepareNavigationSessions(before, after ?? before.document));
    }
    prepared.forEach(port => port?.dispatch()); dispatched = true;
    const results = await client.gateway.commitNavigation({
      documents: changed.map(document => ({ document, expectedRevision: snapshots.find(value => value.page.id === document.pageId)!.page.revision, saveReason: "structure" })),
      expectedFavoriteIds: previous, favoriteIds: favorites,
    });
    let index = 0;
    for (const before of snapshots) {
      if (!changed.some(document => document.pageId === before.page.id) && previous.includes(before.page.id) === favorites.includes(before.page.id)) continue;
      const result = results.find(snapshot => snapshot.page.id === before.page.id);
      if (!result) throw new Error("移动结果缺少笔记回执，请重新核对。");
      await prepared[index++]?.commit(result);
    }
    await Promise.all(ids.map(synchronizeNoteReview)); client.notifyChanged();
  } catch (reason) {
    const rejected = reason instanceof NotesGatewayError && ["invalid_input", "revision_conflict", "not_found"].includes(reason.code);
    prepared.forEach(port => { if (!dispatched || rejected) port?.cancel(); else port?.recover(); });
    client.notifyChanged(); throw reason;
  } finally { ids.forEach(id => holdTextEditor(id, operation, false)); }
}
