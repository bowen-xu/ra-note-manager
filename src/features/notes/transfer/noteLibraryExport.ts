import type {NoteLibraryTransferStorage} from "@research-assistant/workbench-sdk/note-storage";
import {
  NOTE_EXPORT_SCHEMA_VERSION,
  noteBlockId,
  type NoteExportManifestV1,
  type ReadingNoteBlock,
} from "@research-assistant/core/notes";
import type { NoteExportReport } from "@research-assistant/data/notes";

import { collectNoteAssets, noteAssetExportPaths, noteDocumentToMarkdown, safeExportName } from "@research-assistant/workbench-sdk/note-transfer";

export async function exportNoteLibrary(
  gateway: NoteLibraryTransferStorage,
  targetDirectory: string,
): Promise<NoteExportReport> {
  const pages = await gateway.listPages({ status: "active", kind: "all", limit: 2_000 });
  const snapshots = await Promise.all(pages.map((page) => gateway.loadDocument(page.id)));
  const links = (await Promise.all(pages.map((page) => gateway.listOutgoing(page.id)))).flat();
  const readingIds = [...new Set(links.filter((link) => link.target.kind === "reading_note").map((link) => noteBlockId(link.target.id)))];
  const referencedNotes = (await Promise.all(readingIds.map((id) => gateway.getReadingNote(id).catch(() => undefined))))
    .filter((note): note is ReadingNoteBlock => note !== undefined);
  const readingNotes = [...new Map([...(await gateway.listReadingNotes()), ...referencedNotes].map(note => [note.id, note])).values()];
  const assets = new Map<string, { readonly id: string; readonly displayName: string; readonly mimeType: string }>();
  for (const snapshot of snapshots) for (const asset of collectNoteAssets(snapshot.document)) assets.set(asset.id, asset);
  const assetPaths = noteAssetExportPaths(assets.values());
  const exportedAt = new Date().toISOString();
  const manifest: NoteExportManifestV1 = {
    schemaVersion: NOTE_EXPORT_SCHEMA_VERSION,
    exportedAt,
    pages: pages.map((page) => ({ id: page.id, title: page.title, ...(page.parentPageId === undefined ? {} : { parentPageId: page.parentPageId }) })),
    readingNotes,
    links,
    assets: [...assets.values()].map((asset) => ({ id: asset.id, relativePath: assetPaths.get(asset.id)!, mimeType: asset.mimeType })),
  };
  return gateway.exportNotes({
    targetDirectory,
    folderName: `research-assistant-notes-${exportedAt.slice(0, 10)}`,
    manifestJson: JSON.stringify({ ...manifest, documents: snapshots.map((snapshot) => snapshot.document) }, null, 2),
    files: snapshots.map((snapshot) => ({ relativePath: `pages/${safeExportName(snapshot.page.title)}-${snapshot.page.id.slice(0, 8)}.md`, contents: `# ${snapshot.page.title}\n\n${noteDocumentToMarkdown(snapshot.document, assetPaths)}` })),
    assets: [...assets.values()].map((asset) => ({ id: asset.id, relativePath: assetPaths.get(asset.id)! })),
  });
}
