// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { notePageId, type NoteIndexItem } from "@research-assistant/core/notes";
import { NoteLibraryList } from "./NoteLibraryList";

let root: ReturnType<typeof createRoot> | undefined, host: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function props(): ComponentProps<typeof NoteLibraryList> {
  const items: NoteIndexItem[] = Array.from({length: 50}, (_, id) => ({
    id: String(id), title: `笔记 ${id}`, snippet: "正文摘要", category: "independent", updatedAt: "2026-10-22T10:00:00Z", status: "active", isFavorite: false,
    target: {kind: "page", pageId: notePageId(String(id))}, ...(id === 0 ? {sourceLabel: "关联文献"} : {}),
  }));
  return {category: "all", query: "", items, allItems: items, sort: {field: "updatedAt", direction: "descending"}, onSort: vi.fn(),
    onBatchAction: vi.fn(async (chosen: readonly NoteIndexItem[]) => ({succeededIds: chosen.map(item => item.id), failures: []})), isLoading: false, isBusy: false, hasMore: true, error: undefined, warnings: [], navigationToggle: null,
    onOpen: vi.fn(), onAction: vi.fn(), onCreatePage: vi.fn(), onLoadMore: vi.fn(), onRetry: vi.fn()};
}
async function render(input: ComponentProps<typeof NoteLibraryList>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); }
  await act(async () => root!.render(<NoteLibraryList {...input} />));
}

it("renders a full main-content table with original note targets and the shared row controls", async () => {
  const input = props(); await render(input);
  expect(host.querySelector('main[aria-label="完整笔记列表"]')).not.toBeNull();
  expect(host.querySelectorAll("tbody tr")).toHaveLength(50);
  expect([...host.querySelectorAll("th")].map(th => th.textContent)).toEqual(["", "笔记名称", "类型", "关联／归属", "最近编辑"]);
  expect(host.querySelector("tbody tr")?.textContent).toContain("关联文献");
  expect(host.textContent).not.toContain("正文摘要"); expect(host.textContent).not.toMatch(/创建者|最近访问/);
  expect(host.querySelector('.notes-library-view')).toBeNull();
  expect(host.textContent).not.toMatch(/近期|升序|降序/);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="打开笔记：笔记 0"]')!.click());
  expect(input.onOpen).toHaveBeenCalledExactlyOnceWith(input.items[0], false);
  await act(async () => host.querySelector<HTMLButtonElement>(".primary-button")!.click());
  expect(input.onCreatePage).toHaveBeenCalledOnce();
});

it("keeps bulk actions above the header until scrolling pins it, then restores the original state on return", async () => {
  const input = props(); await render(input);
  const header = host.querySelector('thead')!, pane = host.querySelector('main')!;
  vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 600, 500));
  const headerBounds = vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 500, 48));
  await act(async () => host.querySelector<HTMLInputElement>('tbody input')!.click());
  const toolbar = host.querySelector('[role="toolbar"]')!;
  expect(toolbar.parentElement?.className).toBe('notes-library-actions');
  expect(header.classList.contains('has-selection')).toBe(false);
  expect(header.querySelector<HTMLInputElement>('input')!.indeterminate).toBe(true);
  headerBounds.mockReturnValue(new DOMRect(0, 0, 500, 48));
  await act(async () => pane.dispatchEvent(new Event('scroll')));
  expect(header.classList.contains('has-selection')).toBe(true);
  expect(host.querySelector('[role="toolbar"]')).toBe(toolbar);
  await act(async () => header.querySelector<HTMLButtonElement>('[aria-label="按最近编辑排序"]')!.click());
  expect(input.onSort).toHaveBeenCalledWith({field: 'updatedAt', direction: 'ascending'});
  headerBounds.mockReturnValue(new DOMRect(0, 100, 500, 48));
  await act(async () => pane.dispatchEvent(new Event('scroll')));
  expect(header.classList.contains('has-selection')).toBe(false);
  expect(host.querySelector('[role="toolbar"]')).toBe(toolbar);
  await act(async () => toolbar.querySelector<HTMLButtonElement>('[aria-label="取消选择"]')!.click());
  expect(host.querySelector('[role="toolbar"]')).toBeNull();
  expect(header.classList.contains('has-selection')).toBe(false);
  expect(header.querySelector('[aria-label="按笔记名称排序"]')).not.toBeNull();
});

it("loads additional pages against the right-hand list scroll root without duplicate observer requests", async () => {
  let intersect: IntersectionObserverCallback | undefined, options: IntersectionObserverInit | undefined;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback, input: IntersectionObserverInit) { intersect = callback; options = input; }
    observe() {} disconnect() {}
  });
  const input = props(); await render(input);
  expect(options?.root).toBe(host.querySelector("main"));
  const visible = [{isIntersecting: true} as IntersectionObserverEntry];
  await act(async () => { intersect?.(visible, {} as IntersectionObserver); intersect?.(visible, {} as IntersectionObserver); });
  expect(input.onLoadMore).toHaveBeenCalledOnce();
  const more = {...input, items: [...input.items, {...input.items[0]!, id: "extra"}]};
  await render(more);
  await act(async () => intersect?.(visible, {} as IntersectionObserver));
  expect(input.onLoadMore).toHaveBeenCalledTimes(2);
  await render({...more, hasMore: false});
  expect(host.querySelector(".notes-load-more")).toBeNull();
});

it("distinguishes empty, search, partial and failed states while keeping available results", async () => {
  const input = props();
  await render({...input, items: [], allItems: [], hasMore: false});
  expect(host.textContent).toContain("暂无笔记");
  await render({...input, query: "算法", items: [], hasMore: false});
  expect(host.querySelector("h1")?.textContent).toBe("搜索结果"); expect(host.textContent).toContain("没有找到匹配的笔记");
  await render({...input, query: "算法", warnings: ["writing_read_failed: cannot read project"], error: "note_index_unavailable: retry required"});
  expect(host.querySelectorAll("tbody tr")).toHaveLength(50);
  expect(host.textContent).toContain("正文摘要"); expect(host.textContent).toContain("当前结果不完整");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("note_index_unavailable");
  await act(async () => host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
  expect(input.onRetry).toHaveBeenCalledOnce();
});

it("selects all matching results beyond the loaded page and keeps them selected as rows append", async () => {
  const input = props();
  const allItems = [...input.items, ...Array.from({length: 23}, (_, n) => ({...input.items[0]!, id: `extra-${n}`, title: `额外笔记 ${n}`}))];
  await render({...input, allItems});
  const all = host.querySelector<HTMLInputElement>('thead input')!;
  await act(async () => all.click());
  expect(host.textContent).toContain("已选 73 项");
  await render({...input, allItems, items: allItems, hasMore: false});
  expect([...host.querySelectorAll<HTMLInputElement>('tbody input')].every(input => input.checked)).toBe(true);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="删除所选笔记"]')!.click());
  expect(input.onBatchAction).toHaveBeenCalledExactlyOnceWith(allItems, "trash");
  expect(host.querySelector('[aria-label="所选笔记批量操作"]')).toBeNull();
});

it("supports checkbox toggling, Shift range, keyboard select-all and Escape without opening documents", async () => {
  const input = props(); await render(input);
  await act(async () => host.querySelector<HTMLInputElement>('tbody input')!.click());
  expect(host.querySelector<HTMLInputElement>('thead input')!.indeterminate).toBe(true);
  await act(async () => host.querySelectorAll('tbody tr')[3]!.querySelector('td.notes-library-kind')!.dispatchEvent(new MouseEvent('click', {bubbles: true, shiftKey: true})));
  expect(host.querySelectorAll('tr[aria-selected="true"]')).toHaveLength(4);
  expect(input.onOpen).not.toHaveBeenCalled();
  const pane = host.querySelector('main')!;
  await act(async () => pane.dispatchEvent(new KeyboardEvent('keydown', {key: 'a', ctrlKey: true, bubbles: true, cancelable: true})));
  expect(host.querySelectorAll('tr[aria-selected="true"]')).toHaveLength(50);
  await act(async () => pane.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true})));
  expect(host.querySelectorAll('tr[aria-selected="true"]')).toHaveLength(0);
});

it("retains failed selections and specific diagnostics after a partially completed batch", async () => {
  const input = props();
  const onBatchAction = vi.fn(async () => ({succeededIds: ["0"], failures: [{id: "1", title: "笔记 1", message: "revision_conflict: expected 3, actual 4"}]}));
  await render({...input, onBatchAction});
  await act(async () => { host.querySelectorAll<HTMLInputElement>('tbody input')[0]!.click(); });
  await act(async () => { host.querySelectorAll<HTMLInputElement>('tbody input')[1]!.click(); });
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="删除所选笔记"]')!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("revision_conflict");
  expect(host.querySelectorAll('tr[aria-selected="true"]')).toHaveLength(1);
  expect(host.querySelector('tr[aria-selected="true"]')?.getAttribute('data-selection-id')).toBe("1");
  await render({...input, query: "新查询"});
  expect(host.querySelectorAll('tr[aria-selected="true"]')).toHaveLength(0);
});

it("requests global column sorting and exposes the active direction", async () => {
  const input = props(); await render(input);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="按最近编辑排序"]')!.click());
  expect(input.onSort).toHaveBeenCalledWith({field: "updatedAt", direction: "ascending"});
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="按笔记名称排序"]')!.click());
  expect(input.onSort).toHaveBeenCalledWith({field: "title", direction: "ascending"});
  await render({...input, sort: {field: "title", direction: "ascending"}});
  expect(host.querySelector('[aria-label="按笔记名称排序"]')?.parentElement?.getAttribute('aria-sort')).toBe("ascending");
});

it("commits whitespace marquee selection, restores it on cancellation, and cleans up the shared overlay", async () => {
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { frame = undefined; });
  const paint = () => { const pending = frame; frame = undefined; pending?.(0); };
  const input = props(); await render(input);
  const pane = host.querySelector<HTMLElement>('main')!, rows = host.querySelectorAll('tbody tr');
  vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 600, 500));
  Object.defineProperties(pane, {setPointerCapture: {value: vi.fn()}, hasPointerCapture: {value: () => false}});
  vi.spyOn(rows[0]!, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 100, 500, 40));
  vi.spyOn(rows[1]!, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 150, 500, 40));
  const pointer = (type: string, x: number, y: number) => new PointerEvent(type, {button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: x, clientY: y, bubbles: true, cancelable: true});
  await act(async () => pane.dispatchEvent(pointer('pointerdown', 20, 110)));
  await act(async () => window.dispatchEvent(pointer('pointermove', 300, 180)));
  await act(async () => paint());
  expect(host.querySelectorAll('tr[aria-selected="true"]')).toHaveLength(2);
  expect(document.querySelector('.row-selection-marquee')).not.toBeNull();
  await act(async () => window.dispatchEvent(pointer('pointerup', 300, 180)));
  expect(document.querySelector('.row-selection-marquee')).toBeNull();
  await act(async () => pane.dispatchEvent(pointer('pointerdown', 20, 90)));
  await act(async () => window.dispatchEvent(pointer('pointermove', 300, 130)));
  await act(async () => paint());
  expect(host.querySelectorAll('tr[aria-selected="true"]')).toHaveLength(1);
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true})));
  expect(host.querySelectorAll('tr[aria-selected="true"]')).toHaveLength(2);
  expect(document.querySelector('.row-selection-marquee')).toBeNull();
});

it("queries all matching metadata only on intent and keeps ordinary rendering paged",async()=>{
  const input=props(),values=[...input.items,...Array.from({length:23},(_,i)=>({...input.items[0]!,id:`extra-${i}`,target:{kind:"page"as const,pageId:notePageId(`extra-${i}`)}}))];
  let release!:(items:readonly NoteIndexItem[])=>void;const onSelectAll=vi.fn(()=>new Promise<readonly NoteIndexItem[]>(resolve=>{release=resolve;}));
  await render({...input,onSelectAll});expect(onSelectAll).not.toHaveBeenCalled();expect(host.querySelector('table')!.getAttribute('aria-rowcount')).toBe('-1');
  await act(async()=>host.querySelector<HTMLInputElement>('thead input')!.click());expect(onSelectAll).toHaveBeenCalledOnce();expect(host.textContent).toContain('正在读取全部匹配笔记');
  await act(async()=>release(values));expect(host.textContent).toContain('已选 73 项');expect(host.querySelectorAll('tbody tr')).toHaveLength(50);
  await act(async()=>host.querySelector('main')!.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true})));expect(onSelectAll).toHaveBeenCalledOnce();
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="删除所选笔记"]')!.click());expect(input.onBatchAction).toHaveBeenCalledWith(values,'trash');
});
it("treats a selected visible page as partial until explicit whole-query selection completes",async()=>{
  const input=props(),items=input.items.slice(0,3),onSelectAll=vi.fn(async()=>input.items);
  await render({...input,items,allItems:items,onSelectAll});
  for(const checkbox of host.querySelectorAll<HTMLInputElement>('tbody input'))await act(async()=>checkbox.click());
  const all=host.querySelector<HTMLInputElement>('thead input')!;expect(all.indeterminate).toBe(true);expect(all.checked).toBe(false);
  await act(async()=>all.click());expect(onSelectAll).toHaveBeenCalledOnce();expect(host.textContent).toContain('已选 50 项');expect(all.checked).toBe(true);
});
it("aborts select-all when the query changes and does not install its late selection",async()=>{
  const input=props();let release!:(items:readonly NoteIndexItem[])=>void;const onSelectAll=vi.fn((_signal:AbortSignal)=>new Promise<readonly NoteIndexItem[]>(resolve=>{release=resolve;}));
  await render({...input,onSelectAll});await act(async()=>host.querySelector<HTMLInputElement>('thead input')!.click());const signal=onSelectAll.mock.calls[0]![0];
  await render({...input,onSelectAll,query:'new query'});expect(signal.aborted).toBe(true);await act(async()=>release(input.items));expect(host.textContent).not.toContain('已选 50 项');
});
it("keeps a previous selection and diagnostic details when whole-query selection fails",async()=>{
  const input=props(),onSelectAll=vi.fn(async()=>{throw Error('note_catalog_selection_incomplete: operation=select-7');});
  await render({...input,onSelectAll});await act(async()=>host.querySelector<HTMLInputElement>('tbody input')!.click());await act(async()=>host.querySelector<HTMLInputElement>('thead input')!.click());
  expect(host.textContent).toContain('已选 1 项');expect(host.textContent).toContain('select-7');expect(input.onBatchAction).not.toHaveBeenCalled();
});
