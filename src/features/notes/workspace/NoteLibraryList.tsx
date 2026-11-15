import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Clock3, FileText, Link, Plus } from "lucide-react";
import type { NoteCategory, NoteIndexItem, NoteIndexSort, NoteIndexSortField } from "@research-assistant/core/notes";
import { NoteLibraryRow } from "./NoteLibraryRow";
import type { NoteFavoriteAction } from "./noteFavoriteActions";
import { useNoteLibrarySelection } from "./useNoteLibrarySelection";
import { useNoteLibraryWindow } from "./useNoteLibraryWindow";
import { useNoteLibraryHeader } from "./useNoteLibraryHeader";
import { NoteLibraryBulkBar } from "./NoteLibraryBulkBar";
import { NOTE_BULK_LABELS, type NoteBulkAction, type NoteBulkResult } from "./noteBulkActions";
import "./NoteLibraryList.css";
import {catalogErrorMessage} from "./useRetainedNoteCatalog";

const categoryTitles = { all: "全部笔记", independent: "独立笔记", dependent: "附属笔记" } as const;
const columns = [
  {field: "title", title: "笔记名称", Icon: FileText, className: ""},
  {field: "category", title: "类型", className: "notes-library-kind"},
  {field: "source", title: "关联／归属", Icon: Link, className: "notes-library-source"},
  {field: "updatedAt", title: "最近编辑", Icon: Clock3, className: "notes-library-edited"},
] as const;

/** Sorting is supplied by the data layer. Only explicit select-all requests a
 * complete metadata selection; ordinary rendering keeps requested pages. */
export function NoteLibraryList(props: {
  readonly category: NoteCategory; readonly query: string; readonly items: readonly NoteIndexItem[]; readonly allItems: readonly NoteIndexItem[];
  readonly sort: NoteIndexSort; readonly onSort: (sort: NoteIndexSort) => void;
  readonly isLoading: boolean; readonly isBusy: boolean; readonly hasMore: boolean;
  readonly error: string | undefined; readonly warnings: readonly string[];
  readonly onOpen: (item: NoteIndexItem, pin: boolean) => void;
  readonly onAction: (item: NoteIndexItem, action: NoteFavoriteAction) => void;
  readonly onBatchAction: (items: readonly NoteIndexItem[], action: NoteBulkAction) => Promise<NoteBulkResult>;
  readonly onCreatePage: () => void; readonly onLoadMore: () => void; readonly onRetry: () => void;
  readonly navigationToggle: ReactNode;
  readonly onSelectAll?: (signal:AbortSignal)=>Promise<readonly NoteIndexItem[]>;
}): React.JSX.Element {
  const scrollRoot = useRef<HTMLElement>(null), sentinel = useRef<HTMLButtonElement>(null);
  const tableHeader = useRef<HTMLTableSectionElement>(null);
  const headerPinned = useNoteLibraryHeader(scrollRoot, tableHeader);
  const requested = useRef<number | undefined>(undefined), heading = useRef<HTMLHeadingElement>(null);
  const [applying, setApplying] = useState(false), [result, setResult] = useState<{message: string; failures: NoteBulkResult["failures"]}>();
  const [selecting,setSelecting]=useState(false),[extra,setExtra]=useState<readonly NoteIndexItem[]>();
  const selectingRequest=useRef<AbortController|undefined>(undefined);
  const applyingRef = useRef(false), busy = props.isBusy || applying||selecting;
  const scope = `${props.category}\0${props.query.trim()}\0${props.sort.field}\0${props.sort.direction}`;
  const selectionScope=`${props.category}\0${props.query.trim()}`;
  const available=useMemo(()=>{if(!extra)return props.allItems;const values=new Map(props.allItems.map(item=>[item.id,item]));for(const item of extra)if(!values.has(item.id))values.set(item.id,item);return[...values.values()];},[props.allItems,extra]);
  const rowWindow = useNoteLibraryWindow(props.items, scrollRoot, scope, props.query.trim() !== "");
  const selection = useNoteLibrarySelection(available, selectionScope, scrollRoot, busy, rowWindow.getMarqueeIds);
  const itemIndex = useMemo(() => new Map(available.map((item, index) => [item.id, {item, index}])), [available]);
  const chosen = useMemo(() => [...selection.selected].flatMap(id => {
    const entry = itemIndex.get(id); return entry ? [entry] : [];
  }).sort((a, b) => a.index - b.index).map(entry => entry.item), [selection.selected, itemIndex]);
  const searching = props.query.trim() !== "";
  useEffect(()=>{setExtra(undefined);},[selectionScope]);
  useEffect(()=>{if(!selection.selected.size&&!selecting)setExtra(undefined);},[selection.selected.size,selecting]);
  useEffect(()=>()=>{selectingRequest.current?.abort();selectingRequest.current=undefined;},[]);
  useEffect(()=>{selectingRequest.current?.abort();selectingRequest.current=undefined;setSelecting(false);},[scope]);
  const clearSelection=()=>{selection.clear();setExtra(undefined);};
  const completeSelection=selection.all&&(!props.onSelectAll||!props.hasMore||!!extra);
  async function selectAll(toggle=false):Promise<void>{
    if(busy||props.isLoading||selectingRequest.current)return;
    if(completeSelection){if(toggle)clearSelection();return;}
    if(!props.onSelectAll){selection.selectAll();return;}
    const controller=new AbortController();selectingRequest.current=controller;setSelecting(true);setResult(undefined);
    try{
      const values=await props.onSelectAll(controller.signal);
      if(controller.signal.aborted||selectingRequest.current!==controller)return;
      setExtra(values);selection.replace(values.map(item=>item.id));
    }catch(reason){if(!controller.signal.aborted)setResult({message:catalogErrorMessage(reason),failures:[]});}
    finally{if(selectingRequest.current===controller){selectingRequest.current=undefined;setSelecting(false);}}
  }
  useEffect(() => { heading.current?.focus({preventScroll: true}); }, []);
  useEffect(() => {
    requested.current = undefined; setResult(undefined);
    if (scrollRoot.current) scrollRoot.current.scrollTop = 0;
  }, [props.category, props.query, props.sort.field, props.sort.direction]);
  useEffect(() => {
    if (!props.hasMore || props.isLoading || props.error || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || requested.current === props.items.length) return;
      requested.current = props.items.length; props.onLoadMore();
    }, {root: scrollRoot.current, rootMargin: "160px"});
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [props.hasMore, props.isLoading, props.error, props.items.length, props.onLoadMore]);
  function sort(field: NoteIndexSortField): void {
    props.onSort({field, direction: props.sort.field === field ? props.sort.direction === "ascending" ? "descending" : "ascending" : field === "updatedAt" ? "descending" : "ascending"});
  }
  async function apply(action: NoteBulkAction): Promise<void> {
    if (busy || applyingRef.current || !chosen.length) return;
    applyingRef.current = true; setApplying(true); setResult(undefined);
    try {
      const next = await props.onBatchAction(chosen, action);
      selection.remove(new Set(next.succeededIds));
      setResult({message: `已${action === "restore" ? "恢复" : NOTE_BULK_LABELS[action]} ${next.succeededIds.length} 篇笔记${next.failures.length ? `，${next.failures.length} 篇未完成，请查看原因` : ""}。`, failures: next.failures});
    } catch (reason) { setResult({message: reason instanceof Error ? reason.message : String(reason), failures: [{id: "batch", title: "操作未完成", message: reason instanceof Error ? reason.message : String(reason)}]}); }
    finally { applyingRef.current = false; setApplying(false); }
  }
  return <main ref={scrollRoot} tabIndex={-1} className="notes-content notes-library" aria-label="完整笔记列表" aria-busy={props.isLoading || busy}
    onPointerDown={selection.start} onKeyDown={event => {
      if (event.defaultPrevented || busy || !(event.target instanceof Element) || event.target.closest('textarea, input:not([type="checkbox"]), [contenteditable="true"], [role="menu"], [role="dialog"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") { event.preventDefault(); void selectAll(); }
      else if (event.key === "Escape") { event.preventDefault(); clearSelection(); }
    }}>
    {props.navigationToggle}
    <header className="notes-library-header">
      <h1 ref={heading} tabIndex={-1}>{searching ? "搜索结果" : categoryTitles[props.category]}</h1>
      <button type="button" className="primary-button" disabled={busy} onClick={props.onCreatePage}><Plus size={16} aria-hidden="true" />新建页面</button>
    </header>
    {result && <div className="notes-index-feedback" role={result.failures.length ? "alert" : "status"}>{result.message}{result.failures.length > 0 && <details><summary>查看未完成项</summary>{result.failures.map(failure => <p key={failure.id}>{failure.title}：{failure.message}</p>)}</details>}</div>}
    {props.error && <p className="notes-index-feedback" role="alert">{props.error}<button type="button" onClick={props.onRetry}>重试</button></p>}
    {props.warnings.length > 0 && <div className="notes-index-feedback" role="status"><p>部分笔记未能读取，当前结果不完整。</p><details><summary>查看原因</summary>{props.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</details><button type="button" onClick={props.onRetry}>重新读取</button></div>}
    <div className="notes-library-actions">
      {chosen.length > 0 && <NoteLibraryBulkBar items={chosen} busy={busy || props.isLoading} onClear={clearSelection} onApply={action => void apply(action)} />}
    </div>
    {selecting&&<p className="notes-index-feedback" role="status">正在读取全部匹配笔记…</p>}
    <table className="notes-library-table" aria-label="所有笔记" aria-rowcount={props.hasMore?-1:props.allItems.length+1}>
      <thead ref={tableHeader} className={chosen.length && headerPinned ? "has-selection" : undefined}><tr>
        <th scope="col" className="notes-library-select"><input type="checkbox" aria-label={props.onSelectAll&&props.hasMore?"全选当前结果":`全选当前结果（${props.allItems.length}篇）`} checked={completeSelection} ref={element => { if (element) element.indeterminate = selection.partial||selection.all&&!completeSelection; }} disabled={busy || props.isLoading || !props.allItems.length} onChange={()=>{void selectAll(true);}} /></th>
        {columns.map(column => { const Icon = "Icon" in column ? column.Icon : undefined, sorted = props.sort.field === column.field, SortIcon = sorted ? props.sort.direction === "ascending" ? ArrowUp : ArrowDown : ArrowUpDown;
          return <th scope="col" key={column.field} className={column.field === "title" ? "notes-library-title-heading" : column.className} aria-sort={sorted ? props.sort.direction : "none"}>
            <button type="button" className="notes-library-column-label" aria-label={`按${column.title}排序`} onClick={() => sort(column.field)} disabled={busy}>{Icon && <Icon size={16} aria-hidden="true" />}{column.title}<SortIcon className="notes-library-sort-icon" size={13} aria-hidden="true" /></button>
          </th>;
        })}
      </tr></thead>
      <tbody ref={rowWindow.body}>{rowWindow.rows.map(({item, index, gap}) => <Fragment key={item.id}>
        {gap > 0 && <tr className="notes-library-window-gap" aria-hidden="true"><td colSpan={5} style={{height: gap}} /></tr>}
        <NoteLibraryRow item={item} index={index} selected={selection.selected.has(item.id)} busy={busy} loading={props.isLoading} searching={searching}
          onChoose={selection.choose} onOpen={props.onOpen} onAction={props.onAction} />
      </Fragment>)}
        {rowWindow.bottom > 0 && <tr className="notes-library-window-gap" aria-hidden="true"><td colSpan={5} style={{height: rowWindow.bottom}} /></tr>}
      </tbody>
    </table>
    {!props.isLoading && !props.error && props.warnings.length === 0 && props.items.length === 0 && <p className="notes-library-empty">{searching ? "没有找到匹配的笔记" : "暂无笔记"}</p>}
    {props.isLoading && <p className="notes-index-feedback" role="status">{searching ? "正在搜索…" : "正在更新笔记…"}</p>}
    {props.hasMore && <button ref={sentinel} type="button" className="notes-load-more" disabled={props.isLoading || busy} onClick={props.onLoadMore}>加载更多笔记</button>}
  </main>;
}
