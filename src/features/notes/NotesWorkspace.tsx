import { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, type Ref } from "react";
import {useNoteHistoryScope} from "@research-assistant/workbench-sdk/note-documents";
import {readWorkspaceState, useWorkspaceState, writeWorkspaceState, workspaceString} from "@research-assistant/workbench-sdk/workspace-state";
import {usePluginSetting} from "@research-assistant/workbench-sdk/configuration-hooks";
import {noteExplorerSetting, noteFullIndexSetting, noteModeSetting, noteScopeSetting} from "../../public/configuration";
import { BookOpen, PanelLeftOpen, Plus } from "lucide-react";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import type { ResearchProject } from "@research-assistant/core/project";
import { noteBlockId, readingNoteDisplayTitle, type NoteBlockId, type NoteIndexItem, type NoteLink, type NotePage, type NotePageId, type ReadingNoteBlock } from "@research-assistant/core/notes";
import { NotesGatewayError, type NoteDocumentSnapshot, type NoteRevisionSummary } from "@research-assistant/data/notes";

import { useNoteDocumentSession } from "@research-assistant/workbench-sdk/note-documents";
import { useNoteAcceptance } from "@research-assistant/workbench-sdk/note-documents";
import { useResearchObjectTargets } from "@research-assistant/workbench-sdk/note-documents";
import { useNoteResources, useNoteResourceVersion } from "@research-assistant/workbench-sdk/note-resources";
import { useUnifiedNoteIndex } from "./workspace/useUnifiedNoteIndex";
import { navigateSource } from "@research-assistant/workbench-sdk/source-navigation";
import { applyNoteBulkAction, applyFavoriteAction, applyNotePageStatus, NOTE_METADATA_CHANGED, NOTE_PAGES_DELETED, type NoteMetadataChanged } from "./workspace/noteFavoriteActions";
import { importMarkdownIntoLibrary } from "./transfer/noteLibraryImport";
import { exportNoteLibrary } from "./transfer/noteLibraryExport";
import { NoteExportDialog } from "./transfer/NoteExportDialog";
import { requestReadingNotePanelTransfer } from "@research-assistant/workbench-sdk/note-documents";
import { NotesExplorer } from "./workspace/NotesExplorer";
import { NoteLibraryList } from "./workspace/NoteLibraryList";
import { clearNoteRecoveryDraft } from "@research-assistant/workbench-sdk/note-documents";
import { NoteDocumentView } from "@research-assistant/workbench-sdk/note-documents";
import { NoteDocumentPending } from "@research-assistant/workbench-sdk/note-documents";
import { RetainedNoteEditors } from "@research-assistant/workbench-sdk/note-documents";
import { useNotesShortcuts } from "@research-assistant/workbench-sdk/note-documents";
import "./NotesWorkspace.css";
import { useAgentContextCandidate } from "@research-assistant/workbench-sdk/agent-context";
import { useWorkspacePresentation, type WorkspacePresentation } from "@research-assistant/workbench-sdk/workbench";
import { useNoteWorkspaceTabs } from "@research-assistant/workbench-sdk/note-documents";
import { useNoteLifecycleNotice } from "@research-assistant/workbench-sdk/note-documents";
import { synchronizeNoteReview, holdTextEditor } from "@research-assistant/workbench-sdk/note-documents";
import {useNoteDocumentMetadata as useNoteWorkspaceMetadata} from "@research-assistant/workbench-sdk/note-documents";
import { useNoteCatalogTargets } from "@research-assistant/workbench-sdk/note-documents";
import {useNotesExplorerVisibility} from "./workspace/useNotesExplorerVisibility";
import {noteContextCandidate} from "@research-assistant/workbench-sdk/note-documents";
import {hasNoteDraftContent} from "@research-assistant/core/notes";
import {reportNoteCreationError, type NotePageSource} from "@research-assistant/workbench-sdk/note-documents";
import type { NoteWorkspacePort } from "../../public/contracts";
export type { NoteWorkspacePort } from "../../public/contracts";
import {CoreNoteWorkspace, CoreNoteWorkspaceHost, useCoreNoteWorkspaceHost} from "@research-assistant/workbench-sdk/note-documents";
import {useNoteWorkspaceOperations} from "./useNoteWorkspaceOperations";
export function NotesWorkspace(props: Parameters<typeof ManagedNotesWorkspace>[0]): React.JSX.Element {
  return props.embedded ? <CoreNoteWorkspace {...props}/> : <CoreNoteWorkspaceHost {...props}><HostedNotesWorkspace {...props}/></CoreNoteWorkspaceHost>;
}
function HostedNotesWorkspace(props: Parameters<typeof ManagedNotesWorkspace>[0]): React.JSX.Element {
  const host = useCoreNoteWorkspaceHost();
  const {ref: hostRef, ...shared} = host ?? {};
  const {ref, ...local} = props;
  return <ManagedNotesWorkspace {...shared} {...local} {...(ref && ref !== hostRef ? {ref} : {})}/>;
}
function ManagedNotesWorkspace({ initialPageId, initialSnapshot, openRequestKey, pinnedPageId, readingSource, embedded = false, compactHeader = false, ref, sourceNavigation, onNavigatePage, active = true, onClosePage, onHome }: {
  readonly onHome?: () => void;
  readonly pinnedPageId?: NotePageId;
  readonly active?: boolean;
  readonly onClosePage?: (ids: readonly string[], active?: string, presentation?: WorkspacePresentation) => void;
  readonly initialSnapshot?: NoteDocumentSnapshot | undefined;
  readonly compactHeader?: boolean;
  readonly onNavigatePage?: (id: NotePageId) => void;
  readonly sourceNavigation?: import("@research-assistant/workbench-sdk/source-navigation").NoteSourceNavigation | undefined;
  readonly project?: ResearchProject; readonly initialPageId?: NotePageId; readonly openRequestKey?: number; readonly readingSource?: ReadingNoteBlock;
  readonly embedded?: boolean; readonly ref?: Ref<NoteWorkspacePort>;
}): React.JSX.Element {
  const presentation = useWorkspacePresentation(), documentOnly = !embedded && presentation === "document";
  const operations = useNoteWorkspaceOperations(active);
  const client = useNoteResources();
  const changeVersion = useNoteResourceVersion();
  const [mode, setMode] = usePluginSetting(noteModeSetting, {enabled: !embedded});
  const [scope, setScope] = usePluginSetting(noteScopeSetting, {enabled: !embedded});
  const [selectedPageId, setSelectedPageId] = useState<NotePageId>();
  const [query, setQuery] = useWorkspaceState("notes-search","",workspaceString,!embedded);
  const [revisions, setRevisions] = useState<readonly NoteRevisionSummary[]>([]);
  const [outgoingLinks, setOutgoingLinks] = useState<readonly NoteLink[]>([]);
  const [backlinks, setBacklinks] = useState<readonly NoteLink[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [diffControlsTarget, setDiffControlsTarget] = useState<HTMLDivElement | null>(null);
  const setError = useCallback((message: string | undefined) => { if (message) notify.error(message); }, []);
  const setNotice = useCallback((message: string | undefined) => { if (message) notify.info(message); }, []);
  const [isBusy, setIsBusy] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isExplorerOpen, setIsExplorerOpen] = usePluginSetting(noteExplorerSetting, {enabled: !embedded});
  const [showFullIndex, setShowFullIndex] = usePluginSetting(noteFullIndexSetting, {enabled: !embedded});
  const fullIndexVisible = showFullIndex && !embedded && !documentOnly;
  const explorerVisible=useNotesExplorerVisibility(isExplorerOpen);
  const explorerToggleRef = useRef<HTMLButtonElement>(null);
  const wasExplorerOpen = useRef(false);
  useEffect(() => {
    if (wasExplorerOpen.current && !isExplorerOpen) explorerToggleRef.current?.focus();
    wasExplorerOpen.current = isExplorerOpen;
  }, [isExplorerOpen]);
  const pageSession = useNoteDocumentSession({ onError: setError, onNotice: setNotice,
    onLoaded: (id, outgoing, incoming) => {
      setSelectedPageId(id); setShowHistory(false);
      setOutgoingLinks(outgoing); setBacklinks(incoming);
    },
  });
  const { snapshot, setSnapshot, saveStatus, saveMessage,
    editorSessionId, saveControllerRef, loadPage } = pageSession;
  function captureDocumentOwner() {
    const current = operations.capture(), pageId = pageSession.getSnapshot()?.page.id, controller = saveControllerRef.current;
    return {pageId, controller, current: () => current() && pageSession.getSnapshot()?.page.id === pageId && saveControllerRef.current === controller};
  }
  const pageNavigation = useRef(0);
  const {pages,readingNotes,rememberReadingNote}=useNoteWorkspaceMetadata({client,version:changeVersion,active:active&&!fullIndexVisible,
    snapshots:pageSession.retainedSessions.map(session=>session.snapshot),current:snapshot,source:readingSource,
    observe:pageSession.observePages,onError:setError});
  const pendingNavigation = pageSession.loadState.phase === "loading" || pageSession.loadState.phase === "failed"
    ? pageSession.loadState : undefined;
  const displayPage = pendingNavigation ? {id: pendingNavigation.pageId,
    title: pendingNavigation.title ?? pages.find(page => page.id === pendingNavigation.pageId)?.title
      ?? (pendingNavigation.phase === "failed" ? pendingNavigation.failure.kind === "missing" ? "找不到笔记" : "笔记未能打开" : "正在打开笔记…")} : snapshot?.page;
  const noteTargets=useNoteCatalogTargets(changeVersion);
  const readPageMetadata=useCallback((ids:readonly NotePageId[])=>client.gateway.listPageMetadata(ids),[client]);
  useNoteLifecycleNotice(snapshot?.page, active && !fullIndexVisible);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<NoteMetadataChanged>).detail;
      const previous = pageSession.getSnapshot()?.page;
      const changedBodies = new Set(detail.bodyChangedIds);
      for (const page of detail.pages) {
        if (!changedBodies.has(page.id)) pageSession.updateMetadata(page);
        else {
          pageSession.observePages([page]);
          if (pageSession.getSnapshot()?.page.id === page.id)
            void pageSession.refreshAfterStructure(page.id).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
        }
      }
      if (embedded && previous && previous.status !== "trashed" && detail.action === "trash"
        && detail.pages.some(page => page.id === previous.id && page.status === "trashed")) {
        pageSession.disposeSession(previous.id);
        setSelectedPageId(undefined);
        if (readingSource?.pageId === previous.id) window.dispatchEvent(new CustomEvent("research-assistant:reading-note-deleted", { detail: readingSource.id }));
        else window.dispatchEvent(new CustomEvent("research-assistant:literature-note-deleted", { detail: previous.id }));
      }
    };
    window.addEventListener(NOTE_METADATA_CHANGED, update);
    const deleted = (event: Event) => {
      const current = pageSession.getSnapshot()?.page;
      if (!embedded || !current || !(event as CustomEvent<readonly string[]>).detail.includes(current.id)) return;
      pageSession.disposeSession(current.id); setSelectedPageId(undefined);
      if (readingSource?.pageId === current.id) window.dispatchEvent(new CustomEvent("research-assistant:reading-note-deleted", { detail: readingSource.id }));
      else window.dispatchEvent(new CustomEvent("research-assistant:literature-note-deleted", { detail: current.id }));
    };
    window.addEventListener(NOTE_PAGES_DELETED, deleted);
    return () => { window.removeEventListener(NOTE_METADATA_CHANGED, update); window.removeEventListener(NOTE_PAGES_DELETED, deleted); };
  }, [pageSession.updateMetadata, pageSession.observePages, pageSession.getSnapshot, pageSession.refreshAfterStructure, pageSession.disposeSession, embedded, readingSource?.id, readingSource?.pageId]);
  const readingByPage = useMemo(() => new Map(readingNotes.flatMap(note => note.pageId ? [[note.pageId, note] as const] : [])), [readingNotes]);
  const pageTargets = useMemo(() => pages.filter(candidate => candidate.status !== "trashed" && !client.creation?.isDraft(candidate.id)).map(candidate => {
    const reading = readingByPage.get(candidate.id);
    return {id: candidate.id, title: reading ? readingNoteDisplayTitle(reading, candidate.title) : candidate.title};
  }), [pages, readingByPage]);
  const readingTargets = useMemo(() => readingNotes.map(note => ({id: note.id, label: note.source.paperTitle, quote: note.source.quoteExact})), [readingNotes]);
  const activeReadingSource = readingSource?.pageId === snapshot?.page.id ? readingSource
    : snapshot ? readingByPage.get(snapshot.page.id) : undefined;
  useAgentContextCandidate(snapshot && !client.creation?.isDraft(snapshot.page.id) ? noteContextCandidate(snapshot.page, activeReadingSource, outgoingLinks) : null, active && !fullIndexVisible && !pendingNavigation, embedded ? "floating" : "tab");
  const workspaceTabs = useNoteWorkspaceTabs({ page: displayPage, enabled: !embedded, active,
    transientIds:pageSession.retainedSessions.filter(session=>client.creation?.isDraft(session.snapshot.page.id)&&!hasNoteDraftContent(session.snapshot.document)).map(session=>session.snapshot.page.id),
    homeActive: fullIndexVisible,
    ...(active && documentOnly && initialPageId ? { documentPageId: initialPageId } : {}),
    ...(onHome === undefined ? {} : { onHome }),
    ...(pinnedPageId === undefined ? {} : { pinnedPageId }),
    dirty: !pendingNavigation && saveStatus !== "saved", open: (id, background) => openPage(id, undefined, !background), getPageId: pageSession.getSelectedPageId,
    prepare: async id => {
      const current = operations.capture();
      return await pageSession.ensureDurable(false, id) && current();
    },
    dispose: id => {pageSession.disposeSession(id);client.creation?.forgetEmpty(id);},
    clear: preserveHome => { pageNavigation.current++; if (!preserveHome) setShowFullIndex(false); pageSession.deactivate(); setSelectedPageId(undefined); }, onClose: onClosePage });
  const retainedIds = workspaceTabs.retainedIds.join("|");
  useEffect(() => { pageSession.retain(embedded ? [] : workspaceTabs.retainedIds); }, [retainedIds, embedded, snapshot?.page.id, pageSession.retain]);
  const acceptance = useNoteAcceptance({ snapshot, editorSessionId, saves: saveControllerRef });
  const contentRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  useNoteHistoryScope(workspaceRef,active);
  const pageViewStateRef = useRef(new Map<NotePageId, { readonly scrollTop: number; readonly focusTargetId?: string }>());
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handleError = useCallback((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)), []);
  useEffect(() => {
    const pageId = pageSession.getSnapshot()?.page.id;
    if (!pageId) return;
    let current = true;
    void Promise.all([client.links.listOutgoing(pageId), client.links.listBacklinks("note_page", pageId)])
      .then(([outgoing, incoming]) => {
        if (current) { pageSession.rememberLinks(pageId, outgoing, incoming); setOutgoingLinks(outgoing); setBacklinks(incoming); }
      }).catch((reason: unknown) => { if (current) handleError(reason); });
    return () => { current = false; };
  }, [changeVersion, client, handleError, pageSession.getSnapshot, pageSession.rememberLinks]);
  const researchTargets = useResearchObjectTargets(handleError,active&&!!snapshot&&!fullIndexVisible);
  const noteIndex = useUnifiedNoteIndex({ client, changeVersion, enabled: !embedded && !documentOnly && active, category: mode, view: scope, query,
    libraryEnabled:fullIndexVisible,explorerEnabled:explorerVisible });
  useImperativeHandle(ref, () => ({ prepareClose: async (requireSaved = false) => {
    if (operations.hasPending()) return false;
    return await pageSession.ensureAllDurable(requireSaved) && !operations.hasPending();
  } }), [pageSession.ensureAllDurable, operations]);
  const handledOpenRequest = useRef(openRequestKey);
  const selectedDocumentRef = useRef(snapshot?.page.id); selectedDocumentRef.current = snapshot?.page.id;
  useEffect(() => {
    if (!active || !initialPageId || selectedDocumentRef.current === initialPageId && handledOpenRequest.current === openRequestKey) return;
    handledOpenRequest.current = openRequestKey;
    let current = true;
    const owner = operations.capture(), navigation = ++pageNavigation.current, valid = () => current && owner() && navigation === pageNavigation.current;
    void operations.run(async () => {
      if (!await pageSession.ensureDurable() || !valid()) return;
      if (!embedded && !await requestReadingNotePanelTransfer(initialPageId)) {
        if (valid()) setError("请先保存或解决阅读笔记的恢复问题，再在右侧打开。");
        return;
      }
      if (valid()) { setShowFullIndex(false); rememberActivePageView(); await loadPage(initialPageId, true, initialSnapshot, false, initialSnapshot?.page.title); }
    }).catch(handleError);
    return () => { current = false; };
  }, [active, operations, initialPageId, initialSnapshot, openRequestKey, loadPage, handleError, pageSession.ensureDurable, embedded, setError]);
  async function ensureActiveDocumentIsDurable(): Promise<boolean> {
    return await pageSession.ensureDurable(true);
  }

  function rememberActivePageView(focusTargetId?: string): void {
    if (snapshot === undefined) return;
    pageViewStateRef.current.set(snapshot.page.id, {
      scrollTop: contentRef.current?.scrollTop ?? 0,
      ...(focusTargetId === undefined ? {} : { focusTargetId }),
    });
  }
  function openPage(id: NotePageId, focusTargetId?: string, navigate = true, title?: string): Promise<void> { return operations.run(async () => {
    const current = operations.capture(), navigation = ++pageNavigation.current, valid = () => current() && navigation === pageNavigation.current;
    if (!await pageSession.ensureDurable() || !valid()) return;
    if (embedded) {
      window.dispatchEvent(new CustomEvent("research-assistant:open-note-page", { detail: id }));
      return;
    }
    if (!await requestReadingNotePanelTransfer(id)) { if (valid()) setError("请先保存或解决阅读笔记的恢复问题，再在右侧打开。"); return; }
    if (!valid()) return;
    if (navigate) setShowFullIndex(false);
    rememberActivePageView(focusTargetId);
    await loadPage(id, true, undefined, false, title ?? pages.find(page => page.id === id)?.title);
    if (navigate && valid() && pageSession.getSnapshot()?.page.id === id) onNavigatePage?.(id);
  }); }
  useEffect(() => {
    const pageId = snapshot?.page.id;
    const content = contentRef.current;
    if (pageId === undefined || content === null) return;
    const view = pageViewStateRef.current.get(pageId) ?? {scrollTop:embedded ? 0 : readWorkspaceState(`note-scroll:${pageId}`,0,value=>typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0)};
    const frame = window.requestAnimationFrame(() => {
      content.scrollTop = view?.scrollTop ?? 0;
      if (embedded) content.querySelector<HTMLElement>(".bn-editor[contenteditable='true'], .bn-editor [contenteditable='true']")?.focus({ preventScroll: true });
      if (view?.focusTargetId === undefined) return;
      const target = [...content.querySelectorAll<HTMLButtonElement>(".note-page-link-block[data-target-id]")]
        .find((candidate) => candidate.dataset.targetId === view.focusTargetId);
      target?.focus();
      pageViewStateRef.current.set(pageId, { scrollTop: content.scrollTop });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editorSessionId, snapshot?.page.id, embedded]);
  function createPage(addToFavorites = false, source?: NotePageSource): Promise<void> { return operations.run(async () => {
    const owner = captureDocumentOwner();
    setIsBusy(true);
    setError(undefined);
    try {
      if (!await ensureActiveDocumentIsDurable() || !owner.current()) return;
      const created = await client.creation.create(addToFavorites,source);
      if (!owner.current()) return;
      setMode("independent"); setScope(addToFavorites ? "favorites" : "recent"); setQuery("");
      if(source)setScope("favorites");
      await openPage(created.page.id);
    } catch (reason: unknown) {
      reportNoteCreationError(reason);
    } finally {
      setIsBusy(false);
    }
  }); }

  function cancelExport(): Promise<void> { return operations.run(async () => {
    if (await client.gateway.cancelNoteExport()) setNotice("正在取消笔记导出…");
  }); }
  function updateSelectedPage(request: { readonly title?: string; readonly isFavorite?: boolean; readonly projectIds?: readonly string[]; readonly tagIds?: readonly string[] }, targetId?: NotePageId): Promise<void> { return operations.run(async () => {
    const current = operations.capture();
    if (snapshot === undefined) return;
    const pageId = targetId ?? snapshot.page.id;
    if (!await pageSession.ensureDurable(true, pageId) || !current()) return;
    const currentPage = (await client.gateway.loadDocument(pageId)).page;
    if (!current()) return;
    const page = await client.mutate((gateway) => gateway.updatePage({ pageId, expectedRevision: currentPage.revision, ...request }));
    pageSession.updateMetadata(page);
    if (selectedDocumentRef.current !== pageId) return;
    await synchronizeNoteReview(pageId);
  }); }
  function setPageStatus(page: NotePage, status: "active" | "archived" | "trashed"): Promise<void> { return operations.run(async () => {
    const current = operations.capture();
    if (isBusy) return;
    setIsBusy(true);
    try {
      const updated = await applyNotePageStatus(client, page.id, status);
      // Committed trash receipts close all matching tabs and embedded owners.
      if (status === "trashed") return;
      pageSession.updateMetadata(updated);
      if (status === "active" && current()) {
        setMode("all"); setScope("recent"); setQuery("");
        notify.success("笔记已恢复", { id: `note-lifecycle:${page.id}` });
      }
    } finally { setIsBusy(false); }
  }); }
  function permanentlyDeletePage(page: NotePage): Promise<void> { return operations.run(async () => {
    if (isBusy) return;
    const confirmed = window.confirm(`确定永久删除“${page.title}”吗？\n\n正文、历史和项目引用将无法恢复；引用它的其他笔记会保留为断链。子页面会移动到顶层。`);
    if (!confirmed) return;
    setIsBusy(true);
    try {
      const report = await client.mutate((gateway) => gateway.permanentlyDeletePage({ id: page.id, expectedRevision: page.revision }));
      if (embedded) { pageSession.disposeSession(page.id); setSelectedPageId(undefined); }
      else await workspaceTabs.closeDeleted([page.id]);
      if (embedded && readingSource === undefined) window.dispatchEvent(new CustomEvent("research-assistant:literature-note-deleted", { detail: page.id }));
      if (embedded && readingSource?.pageId === page.id) window.dispatchEvent(new CustomEvent("research-assistant:reading-note-deleted", { detail: readingSource.id }));
      setNotice(report.cleanupWarnings.length === 0 ? "页面已永久删除" : `页面已删除；${report.cleanupWarnings.join("；")}`);
    } finally { setIsBusy(false); }
  }); }

  function openHistory(): Promise<void> { return operations.run(async () => {
    const owner = captureDocumentOwner();
    if (snapshot === undefined) return;
    const history = await client.gateway.listRevisions(snapshot.page.id);
    if (!owner.current()) return;
    setRevisions(history);
    setShowHistory(true);
  }); }

  function restoreRevision(id: NoteRevisionSummary["id"]): Promise<void> { return operations.run(async () => {
    const current = operations.capture(), owner = captureDocumentOwner(), navigation = pageNavigation.current;
    if (snapshot === undefined) return;
    if (!await ensureActiveDocumentIsDurable()) throw new Error("请先完成保存或解决冲突，再恢复历史版本。");
    if (!owner.current()) return;
    const pageId = snapshot.page.id;
    const operation = crypto.randomUUID();
    holdTextEditor(pageId, operation, true);
    setIsBusy(true);
    try {
      const stored = await client.gateway.loadDocument(pageId);
      if (!owner.current()) return;
      const restored = await client.mutate((gateway) => gateway.restoreRevision(pageId, id, stored.page.revision));
      if (!owner.current() || navigation !== pageNavigation.current) return;
      await loadPage(pageId, false, restored);
      if (!current() || navigation !== pageNavigation.current || pageSession.getSnapshot()?.page.id !== pageId || pageSession.getSnapshot()?.page.revision !== restored.page.revision) return;
      clearNoteRecoveryDraft(pageId);
      setShowHistory(false);
      setNotice("历史版本已恢复；恢复前的正文仍可在版本历史中查看。");
    } catch (reason) {
      if (owner.current()) owner.controller?.restore(pageSession.getSnapshot()!.document, "conflict");
      throw reason;
    } finally { holdTextEditor(pageId, operation, false); setIsBusy(false); }
  }); }

  function toggleRevisionPinned(revision: NoteRevisionSummary): Promise<void> { return operations.run(async () => {
    const owner = captureDocumentOwner();
    if (snapshot === undefined) return;
    try {
      const updated = await client.gateway.setRevisionPinned(
        snapshot.page.id,
        revision.id,
        !revision.isPinned,
      );
      if (!owner.current()) return;
      setRevisions((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setNotice(updated.isPinned ? "已固定历史版本，不会被自动裁剪。" : "已取消固定，该版本将重新按保留期管理。");
    } catch (reason: unknown) {
      handleError(reason);
    }
  }); }

  function openReadingNote(id: NoteBlockId, title?: string): Promise<void> { return operations.run(async () => {
    const current = operations.capture(), navigation = ++pageNavigation.current;
    if (embedded) {
      window.dispatchEvent(new CustomEvent("research-assistant:open-reading-note", { detail: id }));
      return;
    }
    try {
      const note = await client.gateway.getReadingNote(id);
      if (!current() || navigation !== pageNavigation.current) return;
      if (!note.pageId) throw new Error("阅读笔记尚未迁移为文档。");
      rememberReadingNote(note);
      await openPage(note.pageId, undefined, true, title);
    } catch (reason) { handleError(reason); }
  }); }
  const openReadingRef = useRef(openReadingNote); openReadingRef.current = openReadingNote;
  useEffect(() => {
    if (embedded || !active) return;
    const open = (event: Event): void => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id !== "string") return;
      event.stopImmediatePropagation();
      try { void openReadingRef.current(noteBlockId(id)); } catch (reason) { handleError(reason); }
    };
    window.addEventListener("research-assistant:open-reading-note", open, true);
    return () => window.removeEventListener("research-assistant:open-reading-note", open, true);
  }, [embedded, active, handleError]);

  function duplicateSelectedPage(): Promise<void> { return operations.run(async () => {
    const owner = captureDocumentOwner();
    if (snapshot === undefined || !await ensureActiveDocumentIsDurable() || !owner.current()) return;
    const created = await client.mutate((gateway) => gateway.duplicatePage(snapshot.page.id));
    if (!owner.current()) return;
    await openPage(created.page.id);
  }); }

  function importMarkdown(file: File): Promise<void> { return operations.run(async () => {
    const owner = captureDocumentOwner();
    setIsBusy(true);
    setError(undefined);
    try {
      if (!await ensureActiveDocumentIsDurable() || !owner.current()) return;
      const saved = await importMarkdownIntoLibrary(client, file);
      if (saved === undefined || !owner.current()) return;
      setMode("independent"); setScope("recent"); setQuery("");
      setNotice(`已导入“${saved.page.title}”`);
      await openPage(saved.page.id);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsBusy(false);
    }
  }); }

  function exportPageTree(directory: string): Promise<boolean> { return operations.run(async () => {
    const current = operations.capture();
    setIsBusy(true);
    setIsExporting(true);
    setError(undefined);
    try {
      if (!await ensureActiveDocumentIsDurable() || !current()) return false;
      const report = await exportNoteLibrary(client.gateway, directory);
      notify.success(`已导出 ${report.fileCount} 个文本文件和 ${report.assetCount} 个附件到 ${report.folderName}`);
      return true;
    } catch (reason: unknown) {
      if (reason instanceof NotesGatewayError && reason.code === "operation_cancelled") setNotice("笔记导出已取消，未生成不完整目录");
      else setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setIsExporting(false);
      setIsBusy(false);
    }
  }); }

  useNotesShortcuts({
    searchInputRef,
    scopeRef: workspaceRef,
    onSearch: () => { if (!embedded && !documentOnly) { setIsExplorerOpen(true); window.requestAnimationFrame(() => searchInputRef.current?.focus()); } },
    onSave: () => void saveControllerRef.current?.flush(),
    onCreatePage: () => void createPage(),
  });

  function openIndexItem(item: NoteIndexItem, pin: boolean): void {
    const target = item.target;
    if (target.kind === "writing") {
      const owner = captureDocumentOwner(), navigation = ++pageNavigation.current;
      void operations.run(async () => {
        if (!await ensureActiveDocumentIsDurable() || !owner.current() || navigation !== pageNavigation.current) return;
        await navigateSource(`source://writings/${encodeURIComponent(target.manuscriptId)}/${target.path.split("/").map(encodeURIComponent).join("/")}`);
        if (owner.current() && navigation === pageNavigation.current) setIsExplorerOpen(false);
      }).catch(handleError);
    } else {
      setIsExplorerOpen(false);
      if (pin) workspaceTabs.pin(target.pageId);
      if (target.kind === "reading") void openReadingNote(target.noteId, item.title);
      else void openPage(target.pageId, undefined, true, item.title).catch(handleError);
    }
  }
  const explorerToggle = !embedded && !documentOnly && !isExplorerOpen && <ControlHint content="打开笔记导航"><button aria-label="打开笔记导航" className="notes-explorer-toggle" onClick={() => setIsExplorerOpen(true)} ref={explorerToggleRef} type="button"><PanelLeftOpen aria-hidden="true" size={18} /></button></ControlHint>;

  return (
    <section ref={workspaceRef} className={embedded ? "notes-workspace embedded" : "notes-workspace"} data-presentation={documentOnly ? "document" : "workspace"}>
      {!embedded && !documentOnly && <NotesExplorer
        isBusy={isBusy} isExporting={isExporting} isOpen={isExplorerOpen}
        markdownInputRef={markdownInputRef} searchInputRef={searchInputRef}
        mode={mode} scope={scope} query={query} items={noteIndex.items} now={noteIndex.now}
        isLoading={noteIndex.isLoading} error={noteIndex.error} warnings={noteIndex.warnings}
        hasMore={noteIndex.hasMore} onLoadMore={noteIndex.loadMore} onRetry={noteIndex.retry}
        onReorderFavorites={ids => operations.run(() => noteIndex.reorderFavorites(ids))}
        onFavoriteAction={(item, action) => { void operations.run(() => applyFavoriteAction(client, item, action)).catch(handleError); }}
        onAddInside={item => {
          if (item.target.kind === "writing") return;
          void createPage(false,{pageId:item.target.pageId});
        }}
        selectedPageId={displayPage?.id ?? selectedPageId}
        onCreatePage={() => void createPage(scope === "favorites")} onClose={() => setIsExplorerOpen(false)}
        onCancelExport={() => void cancelExport().catch(handleError)}
        onExport={() => setShowExportDialog(true)} onImportMarkdown={file => void importMarkdown(file)}
        onModeChange={nextMode => { setMode(nextMode); if (nextMode === "dependent" || scope === "archive" || scope === "trash") setScope("recent"); }}
        onScopeChange={next => { if (next !== "recent") setShowFullIndex(false); setScope(next); if (next === "archive" || next === "trash") setQuery(""); }}
        onQueryChange={setQuery}
        onOpen={openIndexItem}
        onViewAll={() => { const current = operations.capture(); rememberActivePageView(); void operations.run(() => workspaceTabs.home()).then(durable => {
          if (durable && current()) { setShowFullIndex(true); setIsExplorerOpen(false); }
        }).catch(handleError); }}
      />}
      {showExportDialog && <NoteExportDialog onClose={() => setShowExportDialog(false)} onExport={exportPageTree} onCancelExport={cancelExport} />}
      {!documentOnly && isExplorerOpen && <button aria-label="关闭笔记导航" className="notes-explorer-backdrop" onClick={() => setIsExplorerOpen(false)} type="button" />}

      {fullIndexVisible && <NoteLibraryList category={mode} query={query} items={noteIndex.libraryItems} allItems={noteIndex.libraryAllItems} sort={noteIndex.librarySort} onSort={noteIndex.setLibrarySort} isLoading={noteIndex.libraryIsLoading} isBusy={isBusy}
        hasMore={noteIndex.libraryHasMore} error={noteIndex.libraryError} warnings={noteIndex.libraryWarnings} onLoadMore={noteIndex.loadLibraryMore} onRetry={noteIndex.retry}
        onSelectAll={noteIndex.collectAll}
        onBatchAction={(items, action) => operations.run(async () => {
          setIsBusy(true);
          try { const result = await applyNoteBulkAction(client, items, action); if (result.failures.length) notify.error(`${result.failures.length} 篇笔记未完成：${result.failures[0]!.message}`); if (result.warnings?.length) notify.error(result.warnings.join("；")); return result; }
          finally { setIsBusy(false); }
        })}
        onOpen={openIndexItem} onAction={(item, action) => { void operations.run(() => applyFavoriteAction(client, item, action)).catch(handleError); }} onCreatePage={() => void createPage()} navigationToggle={explorerToggle} />}
      <main className="notes-content" hidden={fullIndexVisible} ref={contentRef} onScroll={event=>{
        if (!embedded && active && snapshot) writeWorkspaceState(`note-scroll:${snapshot.page.id}`,event.currentTarget.scrollTop);
      }} aria-busy={pageSession.loadState.phase === "loading" || (initialPageId !== undefined && pageSession.loadState.phase === "idle" && snapshot === undefined)}>
        {!fullIndexVisible && explorerToggle}
        {pendingNavigation && <NoteDocumentPending title={pendingNavigation.title ?? pages.find(page => page.id === pendingNavigation.pageId)?.title}
          pageId={pendingNavigation.pageId} failure={pendingNavigation.phase === "failed" ? pendingNavigation.failure : undefined}
          {...(!embedded ? {onHome: () => { void workspaceTabs.home().catch(handleError); }} : {})}
          onRetry={() => { void loadPage(pendingNavigation.pageId, true, undefined, false, pendingNavigation.title).catch(handleError); }}/>}
        {!pendingNavigation && snapshot !== undefined && <NoteDocumentView
          lifecycleBusy={isBusy}
          onRestore={() => void setPageStatus(snapshot.page, "active").catch(handleError)}
          onPermanentlyDelete={() => void permanentlyDeletePage(snapshot.page).catch(handleError)}
          retainEditor
          queryNoteTargets={noteTargets}
          onReadPageMetadata={readPageMetadata}
          onDiffControlsTarget={setDiffControlsTarget}
          compactHeader={compactHeader}
          sourceNavigation={sourceNavigation}
          {...(activeReadingSource === undefined ? {} : { readingSource: activeReadingSource, onReadingColorChange: (color: string) => void operations.run(async () => {
            const owner = captureDocumentOwner();
            if (!await ensureActiveDocumentIsDurable() || !owner.current()) return;
            const current = await client.gateway.getReadingNote(activeReadingSource.id);
            if (!owner.current()) return;
            const next = await client.mutate(gateway => gateway.updateReadingNote({ id: current.id, color, expectedRevision: current.revision }));
            if (!owner.current()) return;
            setSnapshot(value => value && value.page.id === owner.pageId ? { ...value, page: { ...value.page, revision: next.revision } } : value);
            owner.controller?.updateRevision(next.revision);
          }).catch(handleError) })}
          backlinks={backlinks}
          editorSessionId={editorSessionId}
          onInstallPort={acceptance.registerEditor}
          onArchive={() => void setPageStatus(snapshot.page, "archived").catch(handleError)}
          onAssetStatus={setNotice}
          onCloseHistory={() => setShowHistory(false)}
          onDocumentChange={document => { workspaceTabs.pin(document.pageId); pageSession.onDocumentChange(document); }}
          onDuplicate={() => void duplicateSelectedPage().catch(handleError)}
          onOpenHistory={() => void openHistory().catch(handleError)}
          onOpenPage={(id) => void openPage(id).catch(handleError)}
          onOpenReading={(id) => void openReadingNote(id)}
          onLoadRevision={(id) => client.gateway.loadRevision(snapshot.page.id, id)}
          onRestoreRevision={restoreRevision}
          onRetrySave={() => void (async () => {
            if(acceptance.state.phase === "recovery"){await acceptance.retry();return;}
            const result=await pageSession.saveExplicitly();
            setNotice(result==="saved"?"当前笔记已保存。":"当前输入已保全；冲突与待审内容仍保留，保存不代表 Keep。");
          })().catch(handleError)}
          onToggleRevisionPinned={(revision) => void toggleRevisionPinned(revision)}
          onTrash={() => void setPageStatus(snapshot.page, "trashed").catch(handleError)}
          onUpdatePage={(changes) => { workspaceTabs.pin(snapshot.page.id); void updateSelectedPage(changes).catch(handleError); }}
          outgoingLinks={outgoingLinks}
          pages={pages}
          readingNotes={readingNotes}
          researchTargets={researchTargets}
          revisions={revisions}
          saveMessage={saveMessage}
          saveStatus={acceptance.state.phase === "recovery" && acceptance.state.pageId === snapshot.page.id ? "conflict" : saveStatus}
          showHistory={showHistory}
          snapshot={snapshot}
        />}
        <RetainedNoteEditors sessions={pageSession.retainedSessions}
          isPageDraft={id=>client.creation?.isDraft(id) ?? false}
          hasPageTitle={!compactHeader}
          readingPageIds={new Set([...readingNotes.flatMap(note => note.pageId ? [note.pageId] : []), ...readingSource?.pageId ? [readingSource.pageId] : []])}
          activeId={active && !fullIndexVisible && !pendingNavigation ? snapshot?.page.id : undefined}
          onInstallPort={acceptance.registerEditor} diffControlsTarget={diffControlsTarget}
          conflictLocked={saveStatus === "conflict"} sourceNavigation={sourceNavigation}
          onChange={(document, sessionId) => { workspaceTabs.pin(document.pageId); pageSession.onRetainedDocumentChange(document, sessionId); }}
          onAssetStatus={setNotice}
          pageTargets={pageTargets}
          readingTargets={readingTargets}
          queryNoteTargets={noteTargets}
          researchTargets={researchTargets}/>
        {snapshot === undefined && initialPageId === undefined && (pageSession.loadState.phase === "idle" || pageSession.loadState.phase === "ready") && (
          <div className="note-empty-state"><BookOpen aria-hidden="true" size={32} /><h2>{scope === "archive" ? "归档" : scope === "trash" ? "回收站" : "建立你的研究笔记"}</h2><p>{scope === "trash" ? "删除的笔记可以从这里恢复。" : scope === "archive" ? "暂时不活跃的笔记保留在这里。" : "在这里查找所有笔记，或创建一篇独立笔记开始记录。"}</p>{(scope === "recent" || scope === "favorites") && mode !== "dependent" && <button className="primary-button" disabled={isBusy} onClick={() => void createPage(scope === "favorites")} type="button"><Plus aria-hidden="true" size={16} />新建页面</button>}</div>
        )}
      </main>
    </section>
  );
}
