import { chooseAppFile } from "@research-assistant/workbench-sdk/platform";
import { useEffect, useRef, type RefObject } from "react";
import { Archive, Download, FileText, Inbox, Layers3, Link, List, LoaderCircle, MoreHorizontal, Plus, Search, Star, Trash2, Upload, X } from "lucide-react";
import { noteDateGroup, type NoteCategory, type NoteIndexView, type NoteIndexItem } from "@research-assistant/core/notes";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { NoteIndexRow } from "./NoteIndexRow";
import { NoteFavorites } from "./NoteFavorites";
import type { NoteFavoriteAction } from "./noteFavoriteActions";

export type NotesMode = NoteCategory;
export type NotesScope = NoteIndexView;
interface NotesExplorerProps {
  readonly mode: NotesMode; readonly scope: NotesScope; readonly query: string;
  readonly items: readonly NoteIndexItem[]; readonly now: Date;
  readonly selectedPageId: string | undefined;
  readonly isBusy: boolean; readonly isExporting: boolean; readonly isLoading: boolean;
  readonly error: string | undefined; readonly warnings: readonly string[]; readonly hasMore: boolean; readonly isOpen: boolean;
  readonly markdownInputRef: RefObject<HTMLInputElement | null>; readonly searchInputRef: RefObject<HTMLInputElement | null>;
  readonly onClose: () => void; readonly onModeChange: (mode: NotesMode) => void;
  readonly onScopeChange: (scope: NotesScope) => void; readonly onQueryChange: (query: string) => void;
  readonly onOpen: (item: NoteIndexItem, pin: boolean) => void;
  readonly onCreatePage: () => void; readonly onImportMarkdown: (file: File) => void;
  readonly onExport: () => void; readonly onCancelExport: () => void;
  readonly onLoadMore: () => void; readonly onRetry: () => void;
  readonly onViewAll: () => void;
  readonly onReorderFavorites: (ids: readonly string[]) => Promise<void>;
  readonly onAddInside: (item: NoteIndexItem) => void;
  readonly onFavoriteAction: (item: NoteIndexItem, action: NoteFavoriteAction) => void;
}
const modes = [
  { id: "all", label: "全部", icon: Inbox }, { id: "independent", label: "独立笔记", icon: FileText },
  { id: "dependent", label: "附属笔记", icon: Link },
] as const;
const date = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function NotesExplorer(props: NotesExplorerProps): React.JSX.Element {
  const searching = props.query.trim() !== "";
  const heading = searching ? "搜索全部笔记" : ({ recent: "近期", favorites: "收藏", archive: "已归档", trash: "回收站" } as const)[props.scope];
  const explorer = useRef<HTMLElement>(null), sentinel = useRef<HTMLButtonElement>(null);
  const requested = useRef<number | undefined>(undefined);
  useEffect(() => { requested.current = undefined; if (explorer.current) explorer.current.scrollTop = 0; }, [props.mode, props.scope, props.query]);
  const compactRecent = props.scope === "recent" && !searching;
  const visibleItems = compactRecent ? props.items.slice(0, 20) : props.items;
  const canShowAll = compactRecent && (props.items.length > 20 || props.hasMore);
  useEffect(() => {
    if (compactRecent || !props.hasMore || props.isLoading || props.error || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || requested.current === props.items.length) return;
      requested.current = props.items.length; props.onLoadMore();
    }, { root: explorer.current, rootMargin: "160px" });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [compactRecent, props.hasMore, props.isLoading, props.error, props.items.length, props.onLoadMore]);
  let previousGroup = "";
  return <aside ref={explorer} className={`notes-explorer${props.isOpen ? " open" : ""}`} aria-label="笔记导航">
    <header className="notes-explorer-title">
      <span><Layers3 aria-hidden="true" size={17} /><strong>笔记</strong></span>
      <div className="notes-explorer-title-actions">
        <ActionMenu hint portal className="notes-explorer-menu" contentClassName="note-page-action-menu" label="更多笔记操作" trigger={<MoreHorizontal size={17} />}>
          <ActionMenuItem disabled={props.isBusy} onClick={props.onViewAll}><List aria-hidden="true" size={15} />笔记列表</ActionMenuItem>
          <ActionMenuItem onClick={() => props.onScopeChange("archive")}><Archive size={15} />归档</ActionMenuItem>
          <ActionMenuItem onClick={() => props.onScopeChange("trash")}><Trash2 size={15} />回收站</ActionMenuItem>
          <ActionMenuItem disabled={props.isBusy} onClick={() => chooseAppFile(props.markdownInputRef.current, props.onImportMarkdown, "markdown")}><Upload size={15} />导入 Markdown</ActionMenuItem>
          <ActionMenuItem disabled={props.isBusy && !props.isExporting} onClick={props.isExporting ? props.onCancelExport : props.onExport}><Download size={15} />{props.isExporting ? "取消导出" : "导出笔记"}</ActionMenuItem>
        </ActionMenu>
        <button aria-label="关闭笔记导航" className="notes-explorer-close" onClick={props.onClose} type="button"><X aria-hidden="true" size={17} /></button>
      </div>
    </header>
    <nav aria-label="笔记类型" className="notes-mode-tabs" role="tablist">
      {modes.map(({ id, label, icon: Icon }, index) => <button aria-selected={props.mode === id} tabIndex={props.mode === id ? 0 : -1} key={id} onClick={() => props.onModeChange(id)} onKeyDown={event => {
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (["ArrowUp", "ArrowLeft"].includes(event.key) ? 2 : 1)) % 3;
        props.onModeChange(modes[next]!.id);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
      }} role="tab" type="button"><Icon aria-hidden="true" size={15} /><span>{label}</span></button>)}
    </nav>
    <div className="notes-scope-tabs" aria-label="笔记视图">
      <ControlHint content={props.mode === "dependent" ? "附属笔记不支持收藏" : "收藏"}><button aria-disabled={props.mode === "dependent"} aria-pressed={props.scope === "favorites"} onClick={() => { if (props.mode !== "dependent") props.onScopeChange("favorites"); }} type="button"><Star aria-hidden="true" size={12} />收藏</button></ControlHint>
      <button aria-pressed={props.scope === "recent"} onClick={() => props.onScopeChange("recent")} type="button">近期</button>
    </div>
    <label className="notes-search"><Search aria-hidden="true" size={15} /><input aria-label="搜索全部笔记" onChange={event => props.onQueryChange(event.target.value)} placeholder="搜索全部笔记（⌘K）" ref={props.searchInputRef} value={props.query} /></label>
    <div className="notes-explorer-heading"><strong>{heading}</strong><div className="notes-explorer-heading-actions">
      {props.isLoading && <span className="notes-explorer-loading" role="status" aria-label={searching ? "正在搜索笔记" : "正在更新笔记"}><LoaderCircle aria-hidden="true" className="spinning" size={16} /></span>}
      <ControlHint content="新建独立笔记"><button aria-label="新建独立笔记" disabled={props.isBusy} onClick={props.onCreatePage} type="button"><Plus aria-hidden="true" size={16} /></button></ControlHint>
    </div></div>
    <input accept=".md,.markdown,text/markdown,text/plain" hidden onChange={event => { const file = event.target.files?.[0]; if (file) props.onImportMarkdown(file); event.target.value = ""; }} ref={props.markdownInputRef} type="file" />
    {props.error && <p className="notes-index-feedback" role="alert">{props.error}<button onClick={props.onRetry} type="button">重试</button></p>}
    {props.warnings.length > 0 && <div className="notes-index-feedback" role="status"><p>部分笔记未能读取，当前结果不完整。</p><details><summary>查看原因</summary>{props.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</details><button onClick={props.onRetry} type="button">重新读取</button></div>}
    <div className={props.scope === "favorites" && !searching ? "notes-favorites-container" : !searching && props.scope === "recent" ? "notes-simple-list" : "reading-note-list notes-index-list"} aria-label={heading} aria-busy={props.isLoading}>
      {!props.isLoading && !props.error && props.warnings.length === 0 && props.items.length === 0 && <p className="notes-index-feedback">{searching ? "没有找到匹配的笔记" : props.scope === "favorites" ? "还没有收藏独立笔记" : "暂无笔记"}</p>}
      {props.scope === "favorites" && !searching ? <NoteFavorites items={props.items} selectedPageId={props.selectedPageId} onOpen={props.onOpen} onReorder={props.onReorderFavorites} onAddInside={props.onAddInside} onAction={props.onFavoriteAction} disabled={props.isBusy || props.isLoading} /> : visibleItems.map(item => {
        const group = noteDateGroup(item.updatedAt, props.now);
        const showGroup = !searching && group !== previousGroup; previousGroup = group;
        const selected = item.target.kind !== "writing" && item.target.pageId === props.selectedPageId;
        return <div key={item.id}>{showGroup && <h3 className="notes-date-group">{group}</h3>}
          {!searching && props.scope === "recent" ? <div className="note-favorites-row note-recent-row" aria-current={selected ? "page" : undefined}>
            <NoteIndexRow item={item} disabled={props.isBusy || props.isLoading} onOpen={pin => props.onOpen(item, pin)} onAction={action => props.onFavoriteAction(item, action)} />
          </div> : <button aria-current={selected ? "page" : undefined} onClick={() => props.onOpen(item, false)} onDoubleClick={() => props.onOpen(item, true)} type="button">
            <span>{item.category === "independent" ? "独立笔记" : "附属笔记"}{item.status === "archived" ? " · 已归档" : ""}</span>
            <strong>{item.title || "无标题"}</strong>
            {searching && item.snippet && <small>{item.snippet}</small>}
            {(item.owner || item.sourceLabel) && <small>{item.owner ? `归属：${item.owner.label}` : item.sourceLabel}</small>}
            <small>{Number.isNaN(Date.parse(item.updatedAt)) ? "" : date.format(new Date(item.updatedAt))}</small>
          </button>}</div>;
      })}
    </div>
    {canShowAll && <button className="notes-load-more" disabled={props.isBusy} onClick={props.onViewAll} type="button">查看所有</button>}
    {!compactRecent && props.hasMore && <button ref={sentinel} className="notes-load-more" disabled={props.isLoading} onClick={props.onLoadMore} type="button">加载更多</button>}
  </aside>;
}
