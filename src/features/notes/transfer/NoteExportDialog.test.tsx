// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { NoteExportDialog } from "./NoteExportDialog";

it("keeps the directory and allows cancelling the real job while its modal owns focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let finish: (success: boolean) => void = () => undefined;
  const exportJob = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const cancel = vi.fn(async () => { finish(false); }), close = vi.fn();
  try {
    await act(async () => root.render(<NoteExportDialog onClose={close} onExport={exportJob} onCancelExport={cancel} />));
    const dialog = document.querySelector<HTMLDialogElement>('[aria-label="导出笔记"]')!;
    const input = dialog.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "/tmp/notes-export");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => dialog.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const cancelButton = [...dialog.querySelectorAll("button")].find(button => button.textContent === "取消导出")!;
    expect(cancelButton.disabled).toBe(false);
    await act(async () => cancelButton.click());
    expect(cancel).toHaveBeenCalledOnce(); expect(exportJob).toHaveBeenCalledWith("/tmp/notes-export");
    expect(input.value).toBe("/tmp/notes-export"); expect(input.disabled).toBe(false); expect(close).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
