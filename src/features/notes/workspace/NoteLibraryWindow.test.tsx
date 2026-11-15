// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { notePageId, type NoteIndexItem } from "@research-assistant/core/notes";
import { NoteLibraryList } from "./NoteLibraryList";

let root: ReturnType<typeof createRoot> | undefined, host: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function mount(count = 500): Promise<ComponentProps<typeof NoteLibraryList>> {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  frames = new Map(); let frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function(this: HTMLElement) { return this.matches("main.notes-library") ? 520 : 0; });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const scroll = this.closest("main")?.scrollTop ?? 0;
    if (this.matches("main.notes-library")) return new DOMRect(0, 0, 800, 520);
    if (this.matches("thead")) return new DOMRect(40, Math.max(0, 48 - scroll), 720, 52);
    if (this.matches("tbody")) return new DOMRect(40, 100 - scroll, 720, count * 52);
    if (this.matches("tr[data-selection-id]")) return new DOMRect(40, 100 - scroll + (Number(this.getAttribute("aria-rowindex")) - 2) * 52, 720, 52);
    return new DOMRect();
  });
  const items: NoteIndexItem[] = Array.from({length: count}, (_, index) => ({id: String(index), title: `虚拟笔记 ${index}`, snippet: "", category: "independent", updatedAt: "2026-10-23T00:00:00Z", status: "active", isFavorite: false, target: {kind: "page", pageId: notePageId(String(index))}}));
  const input: ComponentProps<typeof NoteLibraryList> = {category: "all", query: "", items, allItems: items, sort: {field: "updatedAt", direction: "descending"},
    onSort: vi.fn(), onOpen: vi.fn(), onAction: vi.fn(), onBatchAction: vi.fn(async (chosen: readonly NoteIndexItem[]) => ({succeededIds: chosen.map(item => item.id), failures: []})),
    onCreatePage: vi.fn(), onLoadMore: vi.fn(), onRetry: vi.fn(), navigationToggle: null, isLoading: false, isBusy: false, hasMore: false, error: undefined, warnings: []};
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<NoteLibraryList {...input} />));
  await flushFrames(); return input;
}
async function flushFrames() {
  await act(async () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); });
}
async function scroll(top: number) {
  const pane = host.querySelector("main")!; pane.scrollTop = top;
  await act(async () => pane.dispatchEvent(new Event("scroll")));
  await flushFrames();
}
const rows = () => [...host.querySelectorAll<HTMLElement>('tbody tr[data-selection-id]')];

it("retains a scrolled row window and pinned header while hidden, then remeasures before observer delivery", async () => {
  const input = await mount();
  await act(async () => host.querySelector<HTMLInputElement>('thead input')!.click());
  await scroll(1000);
  const retained = rows(), pane = host.querySelector("main")!;
  expect(host.querySelector("thead")?.classList.contains("has-selection")).toBe(true);
  let height = 0;
  Object.defineProperty(pane, "clientHeight", { configurable: true, get: () => height });
  const original = vi.mocked(HTMLElement.prototype.getBoundingClientRect).getMockImplementation()!;
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
    return host.hidden ? new DOMRect() : original.call(this);
  });
  host.hidden = true;
  await act(async () => pane.dispatchEvent(new Event("scroll")));
  await flushFrames();
  expect(rows()).toEqual(retained);
  expect(host.querySelector("thead")?.classList.contains("has-selection")).toBe(true);
  host.hidden = false; height = 780;
  await act(async () => root!.render(<NoteLibraryList {...input} />));
  expect(rows().length).toBeGreaterThan(retained.length);
  expect(rows().some(row => row.dataset.selectionId === "18")).toBe(true);
});

it("retains K/2 rows before and after the K viewport rows and releases distant DOM", async () => {
  await mount();
  expect(rows().length).toBeLessThan(25);
  await scroll(1000);
  // Visible rows [18, 28), exactly five extra rows on each side.
  expect(rows().map(row => Number(row.dataset.selectionId))).toEqual(Array.from({length: 20}, (_, i) => i + 13));
  expect(host.querySelector('[data-selection-id="0"]')).toBeNull();
  expect(host.querySelector("table")?.getAttribute("aria-rowcount")).toBe("501");
  await scroll(20_000);
  expect(rows().length).toBeLessThanOrEqual(24);
  expect(host.querySelector('[data-selection-id="18"]')).toBeNull();
  await scroll(0);
  expect(host.querySelector('[data-selection-id="0"]')).not.toBeNull();
  expect(rows().length).toBeLessThan(25);
});

it("keeps selection and full-result batch commands independent of recycled rows", async () => {
  const input = await mount();
  await act(async () => host.querySelector<HTMLInputElement>('[data-selection-id="0"] input')!.click());
  await scroll(1000);
  expect(host.querySelector('[data-selection-id="0"]')).toBeNull();
  expect(host.textContent).toContain("已选 1 项");
  await scroll(0);
  expect(host.querySelector<HTMLInputElement>('[data-selection-id="0"] input')!.checked).toBe(true);
  await act(async () => host.querySelector<HTMLInputElement>('thead input')!.click());
  expect(host.textContent).toContain("已选 500 项");
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="删除所选笔记"]')!.click());
  expect(input.onBatchAction).toHaveBeenCalledWith(input.allItems, "trash");
});

it("marquee selection includes recycled rows between its endpoints and cancels cleanly", async () => {
  await mount();
  const pane = host.querySelector<HTMLElement>("main")!;
  Object.defineProperties(pane, {setPointerCapture: {value: vi.fn()}, hasPointerCapture: {value: () => false}});
  const pointer = (type: string, x: number, y: number) => new PointerEvent(type, {button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: "mouse", clientX: x, clientY: y, bubbles: true, cancelable: true});
  await act(async () => pane.dispatchEvent(pointer("pointerdown", 20, 110)));
  await act(async () => window.dispatchEvent(pointer("pointermove", 400, 400)));
  await scroll(1000);
  await act(async () => window.dispatchEvent(pointer("pointermove", 400, 400)));
  expect(host.querySelector('[data-selection-id="0"]')).toBeNull();
  expect(host.textContent).toContain("已选 25 项");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true})));
  expect(host.querySelector('[aria-label="所选笔记批量操作"]')).toBeNull();
  expect(document.querySelector(".row-selection-marquee")).toBeNull();
});

it("retains only an offscreen focused owner, then releases it when focus moves", async () => {
  await mount();
  await act(async () => host.querySelector<HTMLInputElement>('[data-selection-id="0"] input')!.focus());
  await scroll(1000);
  expect(host.querySelector('[data-selection-id="0"] input')).toBe(document.activeElement);
  expect(rows()).toHaveLength(21);
  await act(async () => host.querySelector<HTMLInputElement>('thead input')!.focus());
  await flushFrames();
  expect(host.querySelector('[data-selection-id="0"]')).toBeNull();
});

it("does not remeasure rows or rerender unchanged row content for selection-only updates", async () => {
  const input = await mount();
  const indexMaps = vi.spyOn(input.allItems, "map"), indexFilters = vi.spyOn(input.allItems, "filter");
  const measurements = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
  // Intl exposes format as a getter at runtime; lib.dom models it as a method.
  const formatting = vi.spyOn(Intl.DateTimeFormat.prototype as unknown as {readonly format: unknown}, "format", "get");
  measurements.mockClear(); formatting.mockClear();
  await act(async () => host.querySelector<HTMLInputElement>('[data-selection-id="0"] input')!.click());
  await flushFrames();
  expect(measurements.mock.contexts.filter(element => element instanceof HTMLElement && element.matches('tr[data-selection-id]'))).toHaveLength(0);
  expect(formatting).toHaveBeenCalledTimes(1);
  await act(async () => host.querySelector<HTMLInputElement>('[data-selection-id="1"] input')!.click());
  await flushFrames();
  expect(measurements.mock.contexts.filter(element => element instanceof HTMLElement && element.matches('tr[data-selection-id]'))).toHaveLength(0);
  expect(formatting).toHaveBeenCalledTimes(2);
  expect(indexMaps).not.toHaveBeenCalled(); expect(indexFilters).not.toHaveBeenCalled();
});
