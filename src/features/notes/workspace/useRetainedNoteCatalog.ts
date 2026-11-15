import {useCallback,useEffect,useRef,useState} from "react";
import type {NoteIndexQuery} from "@research-assistant/core/notes";
import {type UnifiedNoteCatalogPage} from "@research-assistant/data/notes";
import {RetainedNoteCatalog} from "./RetainedNoteCatalog";

import {catalogErrorMessage} from "@research-assistant/workbench-sdk/note-diagnostics";
export {catalogErrorMessage} from "@research-assistant/workbench-sdk/note-diagnostics";
/** React observes a requested metadata page; it never derives a list from
 * editor documents. Scope changes/hidden owners cannot publish late results. */
export function useRetainedNoteCatalog(options:{readonly owner:RetainedNoteCatalog;readonly query:NoteIndexQuery;readonly enabled:boolean;readonly version:number;readonly refresh:number}){
  const {owner,query,enabled,version,refresh}=options;
  const queryId=JSON.stringify([query.category,query.view,query.search,query.sort?.field,query.sort?.direction,query.limit??20]);
  const [entry,setEntry]=useState<{readonly key:string;readonly page:UnifiedNoteCatalogPage}>();
  const [isLoading,setLoading]=useState(false),[error,setError]=useState<string>();
  const generation=useRef(0);
  const load=useCallback((more=false)=>{
    if(!enabled)return;
    const request=++generation.current;setLoading(true);setError(undefined);
    void owner.read(query,version,refresh,more).then(page=>{
      if(request!==generation.current)return;setEntry({key:queryId,page});setLoading(false);
    }).catch(reason=>{
      if(request!==generation.current)return;setError(catalogErrorMessage(reason));setLoading(false);
    });
  },[owner,queryId,enabled,version,refresh]);
  useEffect(()=>{
    if(enabled)load();else setLoading(false);
    return()=>{generation.current++;owner.suspend();};
  },[owner,enabled,load]);
  useEffect(()=>()=>owner.dispose(),[owner]);
  const page=entry?.key===queryId?entry.page:undefined;
  return{page,error,isLoading:isLoading||(enabled&&!page&&!error),loadMore:useCallback(()=>load(true),[load])};
}
