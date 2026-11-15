import {useCallback,useEffect,useMemo,useState} from "react";
import {DEFAULT_NOTE_INDEX_SORT,type NoteCategory,type NoteIndexView,type NoteIndexSort,type NoteIndexItem} from "@research-assistant/core/notes";
import {NotesGatewayError,type UnifiedNoteCatalogPage} from "@research-assistant/data/notes";
import type {NoteResourceAccess} from "@research-assistant/workbench-sdk/note-resources";
import {getOptionalWritingNoteCatalog} from "@research-assistant/workbench-sdk/domain-capabilities";
import {RetainedNoteCatalog} from "./RetainedNoteCatalog";
import {createWorkspaceNoteCatalog,collectNoteCatalogSelection} from "./noteCatalogQueries";
import {useRetainedNoteCatalog} from "./useRetainedNoteCatalog";
import {useWritingCatalogPreparation} from "./useWritingCatalogPreparation";

const empty:readonly NoteIndexItem[]=[];
const warnings=(page:UnifiedNoteCatalogPage|undefined,preparationError:string|undefined):readonly string[]=>[
  ...(page?.pendingCount?[`writing_note_catalog_pending：还有 ${page.pendingCount} 篇写作笔记正在准备，已就绪内容可先查看。`]:[]),
  ...(page?.errorCount?[`writing_note_catalog_partial：${page.errorCount} 篇写作笔记未能读取。`,...page.issues.map(issue=>`${issue.manuscriptId}/${issue.path}：${issue.cause}`)]:[]),
  ...(preparationError?[preparationError]:[]),
];
export function useUnifiedNoteIndex(options:{readonly client:NoteResourceAccess;readonly changeVersion:number;readonly enabled:boolean;
  readonly category:NoteCategory;readonly view:NoteIndexView;readonly query:string;readonly libraryEnabled?:boolean;readonly explorerEnabled?:boolean}){
  const {client,changeVersion,enabled,category,view,query,libraryEnabled=false,explorerEnabled=true}=options;
  const writing=useMemo(()=>getOptionalWritingNoteCatalog(),[client]);
  const owners=useMemo(()=>({explorer:new RetainedNoteCatalog(createWorkspaceNoteCatalog(client.gateway,writing)),library:new RetainedNoteCatalog(createWorkspaceNoteCatalog(client.gateway,writing))}),[client,writing]);
  const [refreshVersion,setRefreshVersion]=useState(0),[librarySort,setLibrarySort]=useState<NoteIndexSort>(DEFAULT_NOTE_INDEX_SORT);
  const [search,setSearch]=useState(()=>query.trim()),[now,setNow]=useState(()=>new Date());
  const refresh=useCallback(()=>{client.links.invalidate({kind:"all"});setRefreshVersion(value=>value+1);},[client]);
  useEffect(()=>{const timer=window.setTimeout(()=>setSearch(query.trim()),220);return()=>window.clearTimeout(timer);},[query]);
  const settled=search===query.trim();
  const explorerQuery=useMemo(()=>({category,view,search,limit:20}),[category,view,search]);
  const libraryQuery=useMemo(()=>({category,view,search,sort:librarySort,limit:50}),[category,view,search,librarySort]);
  const explorer=useRetainedNoteCatalog({owner:owners.explorer,query:explorerQuery,enabled:enabled&&explorerEnabled&&settled,version:changeVersion,refresh:refreshVersion});
  const library=useRetainedNoteCatalog({owner:owners.library,query:libraryQuery,enabled:enabled&&libraryEnabled&&settled,version:changeVersion,refresh:refreshVersion});
  const current=libraryEnabled?library:explorer;
  const scope=search?"live":view==="archive"?"archived":"active";
  const onPrepared=useCallback(()=>setRefreshVersion(value=>value+1),[]);
  const preparation=useWritingCatalogPreparation({gateway:writing,page:current.page,scope,enabled:enabled&&(libraryEnabled||explorerEnabled)&&settled&&view!=="trash",onPrepared});
  const retry=useCallback(()=>{preparation.retry();refresh();},[preparation.retry,refresh]);
  useEffect(()=>{
    const reload=()=>{setNow(new Date());refresh();};
    const timer=enabled?window.setInterval(()=>{if(document.visibilityState!=="hidden")reload();},30_000):undefined;
    window.addEventListener("focus",reload);window.addEventListener("research-assistant:writing-notes-changed",reload);
    return()=>{if(timer!==undefined)window.clearInterval(timer);window.removeEventListener("focus",reload);window.removeEventListener("research-assistant:writing-notes-changed",reload);};
  },[enabled,refresh]);
  const items=settled?explorer.page?.items??empty:empty,libraryItems=settled?library.page?.items??empty:empty;
  async function reorderFavorites(ids:readonly string[]):Promise<void>{
    const initial=explorer.page;if(!initial)return;
    const targets=new Map(items.flatMap(item=>item.target.kind==="writing"?[]:[[item.id,item.target.pageId]as const]));
    const selected=ids.map(id=>targets.get(id));
    if(selected.some(id=>!id)||new Set(ids).size!==ids.length)throw new NotesGatewayError("invalid_input","note_favorite_order_invalid：收藏排序包含无效笔记。");
    const validate=async()=>{const page=await client.gateway.pageCatalog!.queryNotePageCatalog({...explorerQuery,search:"",limit:1});if(page.revision!==initial.revisions.pages)throw new NotesGatewayError("revision_conflict","note_catalog_changed：收藏目录已更新，请重新排序。");};
    try{
      await validate();const before=await client.gateway.listFavoritePageIds();await validate();
      const included=new Set(selected);let position=0;
      await client.mutate(gateway=>gateway.reorderFavorites({pageIds:before.map(id=>included.has(id)?selected[position++]!:id),expectedPageIds:before}));
    }catch(reason){refresh();throw reason;}
  }
  return{items,libraryItems,libraryAllItems:libraryItems,librarySort,setLibrarySort,now,refresh,retry,
    isLoading:explorer.isLoading||!settled,libraryIsLoading:library.isLoading||!settled,error:explorer.error,libraryError:library.error,
    warnings:[...(!writing?["writing_note_catalog_unavailable：未装配写作插件；当前显示 Core 笔记，写作笔记与关联保留，恢复装配后可再访问。"]:[]),...warnings(explorer.page,preparation.error)],
    libraryWarnings:[...(!writing?["writing_note_catalog_unavailable：未装配写作插件；当前显示 Core 笔记，写作笔记与关联保留，恢复装配后可再访问。"]:[]),...warnings(library.page,preparation.error)],
    hasMore:settled&&!!explorer.page?.nextCursor,libraryHasMore:settled&&!!library.page?.nextCursor,
    loadMore:explorer.loadMore,loadLibraryMore:library.loadMore,reorderFavorites,
    collectAll:(signal?:AbortSignal)=>collectNoteCatalogSelection(createWorkspaceNoteCatalog(client.gateway,writing),libraryQuery,signal),
  };
}
