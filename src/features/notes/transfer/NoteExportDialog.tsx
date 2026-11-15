import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen } from "lucide-react";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { chooseNoteExportDirectory } from "@research-assistant/workbench-sdk/note-transfer";
import "./NoteExportDialog.css";

export function NoteExportDialog({ onClose, onExport, onCancelExport }: {
  readonly onClose: () => void;
  readonly onExport: (directory: string) => Promise<boolean>;
  readonly onCancelExport: () => Promise<void>;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const [directory, setDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const mounted = useRef(true), pending = useRef(false), composing = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (!dialog.current?.open) dialog.current?.showModal();
    return () => { mounted.current = false; };
  }, []);
  const valid = directory.trim().length > 0 && !directory.includes("\0");
  async function choose(): Promise<void> {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const selected = await chooseNoteExportDirectory();
      if (mounted.current && selected) setDirectory(selected);
    } catch (reason) { notify.error(reason instanceof Error ? reason.message : "无法选择导出目录"); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  async function submit(): Promise<void> {
    if (!valid || pending.current || composing.current) return;
    pending.current = true; setBusy(true); setExporting(true);
    try { if (await onExport(directory.trim()) && mounted.current) onClose(); }
    finally { pending.current = false; if (mounted.current) { setBusy(false); setExporting(false); } }
  }
  function cancel(): void {
    if (exporting) void onCancelExport().catch(reason => notify.error(reason instanceof Error ? reason.message : "无法取消笔记导出"));
    else if (!pending.current) onClose();
  }
  return createPortal(<dialog ref={dialog} aria-label="导出笔记" className="note-export-dialog"
    onCancel={event => { event.preventDefault(); cancel(); }}>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <h2>导出笔记</h2><p>选择保存目录，导出页面树、Markdown 文件和附件。</p>
      <label>导出目录<input aria-label="笔记导出目录" value={directory} disabled={busy} autoFocus
        onChange={event => setDirectory(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} placeholder="选择或输入保存路径" /></label>
      <button type="button" className="note-export-browse" disabled={busy} onClick={() => void choose()}><FolderOpen aria-hidden="true" size={16} />选择目录</button>
      <footer><button type="button" className="ghost-button" disabled={busy && !exporting} onClick={cancel}>{exporting ? "取消导出" : "取消"}</button>
        <button type="submit" className="primary-button" disabled={!valid || busy}>{busy ? "正在处理…" : "导出"}</button></footer>
    </form>
  </dialog>, document.body);
}
