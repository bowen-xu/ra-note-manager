// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest";
import {noteDocumentPlainText, notePageId} from "@research-assistant/core/notes";
import type {NoteDocumentSnapshot} from "@research-assistant/data/notes";
import type {NoteResourceAccess, NoteResourceGateway} from "@research-assistant/workbench-sdk/note-resources";
import {MAX_MARKDOWN_IMPORT_BYTES} from "@research-assistant/workbench-sdk/note-transfer";
import {importMarkdownIntoLibrary} from "./noteLibraryImport";

const confirmationPort = vi.hoisted(() => ({confirm: vi.fn<(message: string) => Promise<boolean>>()}));
vi.mock("@research-assistant/workbench-sdk/platform", () => ({confirm: confirmationPort.confirm}));
afterEach(() => {
  vi.restoreAllMocks();
  confirmationPort.confirm.mockReset();
});

function confirmation() {
  let resolve!: (accepted: boolean) => void;
  let reject!: (reason: unknown) => void;
  const pending = new Promise<boolean>((accept, fail) => {resolve = accept; reject = fail;});
  const confirm = confirmationPort.confirm.mockReturnValue(pending);
  return {confirm, resolve, reject};
}

function input(markdown: string, size?: number) {
  const file = new File([markdown], "portable-import.md", {type: "text/markdown"});
  const text = vi.fn(async () => markdown);
  Object.defineProperty(file, "text", {value: text});
  if (size !== undefined) Object.defineProperty(file, "size", {value: size});
  return {file, text};
}

function writes() {
  const id = notePageId("core-created-import-page");
  const created: NoteDocumentSnapshot = {
    page: {id, title: "portable-import", position: 0, status: "active", isFavorite: false,
      revision: 7, schemaVersion: 1, projectIds: [], tagIds: [],
      createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z"},
    document: {schemaVersion: 1, pageId: id, blocks: []},
  };
  const createPage = vi.fn<NoteResourceGateway["createPage"]>(async () => created);
  const saveDocument = vi.fn<NoteResourceGateway["saveDocument"]>(async request => ({
    page: {...created.page, revision: created.page.revision + 1}, document: request.document,
  }));
  const unsupported = (): never => { throw new Error("Import fixture supports only mutate/createPage/saveDocument"); };
  const gateway: NoteResourceGateway = {
    createPage, saveDocument,
    listPages: unsupported, listPageMetadata: unsupported, listFavoritePageIds: unsupported,
    reorderFavorites: unsupported, applyMetadataBatch: unsupported, updatePage: unsupported,
    duplicatePage: unsupported, permanentlyDeletePage: unsupported, loadDocument: unsupported,
    commitNavigation: unsupported, listRevisions: unsupported, loadRevision: unsupported,
    restoreRevision: unsupported, setRevisionPinned: unsupported, listOutgoing: unsupported,
    listReadingNotes: unsupported, getReadingNote: unsupported, updateReadingNote: unsupported,
    exportNotes: unsupported, cancelNoteExport: unsupported,
  };
  // Unsupported capabilities fail explicitly instead of being hidden by a partial-port cast.
  const client: NoteResourceAccess = {
    gateway, subscribe: unsupported, getVersion: unsupported, getChangesSince: unsupported, notifyChanged: unsupported,
    links: {listOutgoing: unsupported, listBacklinks: unsupported, invalidate: unsupported},
    creation: {create: unsupported, isDraft: unsupported, forgetEmpty: unsupported},
    history: {closeGroups: unsupported, record: unsupported, run: unsupported},
    mutate<T>(operation: (port: NoteResourceGateway) => Promise<T>): Promise<T> { return operation(gateway); },
  };
  const mutate = vi.spyOn(client, "mutate");
  return {client, created, createPage, saveDocument, mutate};
}

it("previews real Markdown but creates and saves nothing when confirmation is cancelled", async () => {
  const {file, text} = input("Imported paragraph.\n\n![Remote figure](https://example.test/figure.png)");
  const {confirm, resolve} = confirmation();
  const {client, mutate, createPage, saveDocument} = writes();
  const importing = importMarkdownIntoLibrary(client, file);
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
  expect(mutate).not.toHaveBeenCalled();
  expect(createPage).not.toHaveBeenCalled(); expect(saveDocument).not.toHaveBeenCalled();
  resolve(false);
  await expect(importing).resolves.toBeUndefined();
  expect(text).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("portable-import"));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("未复制"));
  expect(mutate).not.toHaveBeenCalled();
  expect(createPage).not.toHaveBeenCalled(); expect(saveDocument).not.toHaveBeenCalled();
});

it("saves parsed Markdown under the Core-created identity and original revision/import boundary", async () => {
  const {file} = input("Imported **evidence**.\n\n- One item");
  const {confirm, resolve} = confirmation();
  const {client, created, createPage, saveDocument, mutate} = writes();
  const importing = importMarkdownIntoLibrary(client, file);
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
  expect(mutate).not.toHaveBeenCalled();
  expect(createPage).not.toHaveBeenCalled(); expect(saveDocument).not.toHaveBeenCalled();
  resolve(true);
  const result = await importing;
  expect(confirm).toHaveBeenCalledOnce();
  expect(createPage).toHaveBeenCalledExactlyOnceWith({title: "portable-import"});
  expect(saveDocument).toHaveBeenCalledOnce(); expect(mutate).toHaveBeenCalledTimes(2);
  expect(createPage.mock.invocationCallOrder[0]).toBeLessThan(saveDocument.mock.invocationCallOrder[0]!);
  const request = saveDocument.mock.calls[0]![0];
  expect(request).toMatchObject({expectedRevision: 7, saveReason: "import", document: {schemaVersion: 1, pageId: created.page.id}});
  expect(noteDocumentPlainText(request.document)).toContain("Imported evidence.");
  expect(request.document.blocks).toContainEqual(expect.objectContaining({type: "bulletListItem"}));
  expect(request.document.blocks[0]?.content).toMatchObject({kind: "inline", items: expect.arrayContaining([
    expect.objectContaining({type: "text", text: "evidence", styles: ["bold"]}),
  ])});
  expect(result).toEqual({page: {...created.page, revision: 8}, document: request.document});
});

it("rejects files exceeding 8 MiB before reading, confirmation or Core writes", async () => {
  const {file, text} = input("Unread body", MAX_MARKDOWN_IMPORT_BYTES + 1);
  const {confirm} = confirmation();
  const {client, mutate, createPage, saveDocument} = writes();
  expect(MAX_MARKDOWN_IMPORT_BYTES).toBe(8 * 1024 * 1024);
  await expect(importMarkdownIntoLibrary(client, file)).rejects.toThrow("Markdown 文件不能超过 8 MB");
  expect(text).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
  expect(createPage).not.toHaveBeenCalled(); expect(saveDocument).not.toHaveBeenCalled();
});

it("preserves a confirmation failure without creating or saving a Core document", async () => {
  const {file} = input("No admitted import.");
  const {confirm, reject} = confirmation();
  const {client, mutate, createPage, saveDocument} = writes();
  const importing = importMarkdownIntoLibrary(client, file);
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
  const failure = Object.assign(new Error("PLATFORM_CONFIRMATION_FAILED: permission_denied"), {code: "PLATFORM_CONFIRMATION_FAILED"});
  reject(failure);
  await expect(importing).rejects.toBe(failure);
  expect(mutate).not.toHaveBeenCalled();
  expect(createPage).not.toHaveBeenCalled(); expect(saveDocument).not.toHaveBeenCalled();
});
