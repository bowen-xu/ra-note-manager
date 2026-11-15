// @vitest-environment happy-dom
import { act, createRef, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { notePageId } from "@research-assistant/core/notes";
import { NotesExplorer } from "./NotesExplorer";
it("keeps 20 compact recent rows and delegates View All to the main-content host without expanding or paginating the sidebar", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host), load = vi.fn(), viewAll = vi.fn();
  const props: ComponentProps<typeof NotesExplorer> = { mode: "all", scope: "recent", query: "", now: new Date("2026-10-22"),
    items: Array.from({ length: 50 }, (_, id) => ({ id: String(id), title: `title ${id}`, snippet: "hidden details", category: "independent", updatedAt: "2026-10-22", status: "active", isFavorite: false, target: { kind: "page", pageId: notePageId(String(id)) } })),
    selectedPageId: undefined, isBusy: false, isExporting: false, isLoading: false, error: undefined, warnings: [], hasMore: true, isOpen: true,
    markdownInputRef: createRef(), searchInputRef: createRef(), onClose: vi.fn(), onModeChange: vi.fn(), onScopeChange: vi.fn(), onQueryChange: vi.fn(), onOpen: vi.fn(), onCreatePage: vi.fn(), onImportMarkdown: vi.fn(), onExport: vi.fn(), onCancelExport: vi.fn(), onLoadMore: load, onViewAll: viewAll, onRetry: vi.fn(), onReorderFavorites: vi.fn(), onAddInside: vi.fn(), onFavoriteAction: vi.fn() };
  try {
    await act(async () => root.render(<NotesExplorer {...props} />));
    expect(host.querySelectorAll('.note-recent-row')).toHaveLength(20);
    expect(host.querySelector('.note-favorite-toggle')).toBeNull(); expect(host.textContent).not.toContain("hidden details");
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === "查看所有")!.click());
    expect(host.querySelectorAll('.note-recent-row')).toHaveLength(20);
    expect(viewAll).toHaveBeenCalledOnce(); expect(load).not.toHaveBeenCalled();
    expect(host.querySelector('.notes-load-more')?.textContent).toBe("查看所有");
    // A small recent list has no footer, but its menu must still reach the same full-list host.
    await act(async () => root.render(<NotesExplorer {...props} items={props.items.slice(0, 2)} hasMore={false} />));
    expect(host.querySelector('.notes-load-more')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="更多笔记操作"]')!.click());
    await vi.waitFor(() => expect(document.querySelector('[role="menu"][aria-label="更多笔记操作"]')).not.toBeNull());
    const menu = document.querySelector('[role="menu"][aria-label="更多笔记操作"]')!;
    const actions = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(actions.slice(0, 2).map(button => button.textContent)).toEqual(["笔记列表", "归档"]);
    await act(async () => actions[0]!.click());
    expect(viewAll).toHaveBeenCalledTimes(2); expect(load).not.toHaveBeenCalled();
    expect(props.onScopeChange).not.toHaveBeenCalled();
    expect(host.querySelectorAll('.note-recent-row')).toHaveLength(2);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it.each(["", "研究"])("shows loading beside the create button without adding a feedback row (query=%s)", async query => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const props: ComponentProps<typeof NotesExplorer> = {mode: "all", scope: "recent", query, now: new Date("2026-10-22"),
    items: [{id: "one", title: "研究笔记", snippet: "", category: "independent", updatedAt: "2026-10-22", status: "active", isFavorite: false, target: {kind: "page", pageId: notePageId("one")}}],
    selectedPageId: undefined, isBusy: false, isExporting: false, isLoading: false, error: undefined, warnings: [], hasMore: false, isOpen: true,
    markdownInputRef: createRef(), searchInputRef: createRef(), onClose: vi.fn(), onModeChange: vi.fn(), onScopeChange: vi.fn(), onQueryChange: vi.fn(), onOpen: vi.fn(), onCreatePage: vi.fn(), onImportMarkdown: vi.fn(), onExport: vi.fn(), onCancelExport: vi.fn(), onLoadMore: vi.fn(), onViewAll: vi.fn(), onRetry: vi.fn(), onReorderFavorites: vi.fn(), onAddInside: vi.fn(), onFavoriteAction: vi.fn()};
  try {
    await act(async () => root.render(<NotesExplorer {...props} />));
    const heading = host.querySelector(".notes-explorer-heading")!, list = host.querySelector("[aria-busy]")!, row = list.firstElementChild;
    const create = heading.querySelector<HTMLButtonElement>('[aria-label="新建独立笔记"]')!;
    expect(heading.querySelector('[role="status"]')).toBeNull();
    await act(async () => root.render(<NotesExplorer {...props} isLoading />));
    const loading = heading.querySelector('[role="status"]')!;
    expect(loading.getAttribute("aria-label")).toBe(query ? "正在搜索笔记" : "正在更新笔记");
    expect(loading.nextElementSibling).toBe(create);
    expect(loading.querySelector("svg.spinning")).not.toBeNull();
    expect(host.querySelector(".notes-index-feedback")).toBeNull();
    expect(host.querySelector("[aria-busy]")).toBe(list);
    expect(list.firstElementChild).toBe(row);
    expect(list.getAttribute("aria-busy")).toBe("true");
    await act(async () => root.render(<NotesExplorer {...props} />));
    expect(heading.querySelector('[role="status"]')).toBeNull();
    expect(list.firstElementChild).toBe(row);
    expect(heading.querySelector('[aria-label="新建独立笔记"]')).toBe(create);
    await act(async () => create.click());
    expect(props.onCreatePage).toHaveBeenCalledOnce();
  } finally {await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();}
});
