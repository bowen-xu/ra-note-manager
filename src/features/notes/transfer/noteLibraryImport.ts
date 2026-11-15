import {notePageId} from "@research-assistant/core/notes";
import type {NoteDocumentSnapshot} from "@research-assistant/data/notes";
import type {NoteResourceAccess} from "@research-assistant/workbench-sdk/note-resources";
import {MAX_MARKDOWN_IMPORT_BYTES,previewMarkdownImport} from "@research-assistant/workbench-sdk/note-transfer";
import {confirm} from "@research-assistant/workbench-sdk/platform";

export async function importMarkdownIntoLibrary(
  client: NoteResourceAccess,
  file: File,
): Promise<NoteDocumentSnapshot | undefined> {
  if (file.size > MAX_MARKDOWN_IMPORT_BYTES) throw new Error("Markdown 文件不能超过 8 MB");
  const title = file.name.replace(/\.(md|markdown)$/iu, "") || "导入的笔记";
  const preview = previewMarkdownImport(notePageId("markdown-import-preview"), await file.text());
  const warning = preview.warnings.length === 0 ? "" : `\n\n注意：${preview.warnings.join("；")}`;
  if (!await confirm(`将导入“${title}”，共 ${preview.blockCount} 个内容块。${warning}`)) return undefined;
  const created = await client.mutate((gateway) => gateway.createPage({ title }));
  return client.mutate((gateway) => gateway.saveDocument({
    document: { ...preview.document, pageId: created.page.id },
    expectedRevision: created.page.revision,
    saveReason: "import",
  }));
}
