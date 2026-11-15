import {useCallback,useEffect,useRef,useState} from "react";
import type {WritingNoteCatalogGateway,UnifiedNoteCatalogPage,WritingNoteCatalogPreparationOptions} from "@research-assistant/data/notes";
import {catalogErrorMessage} from "./useRetainedNoteCatalog";

/** Publish a ready list first. Prepare at most one bounded batch at a time,
 * only for the visible query; hiding prevents any queued follow-up batch. */
export function useWritingCatalogPreparation(options:{readonly gateway:WritingNoteCatalogGateway|undefined;readonly page:UnifiedNoteCatalogPage|undefined;
  readonly scope:NonNullable<WritingNoteCatalogPreparationOptions["scope"]>;readonly enabled:boolean;readonly onPrepared:()=>void}){
  const {gateway,page,scope,enabled,onPrepared}=options;
  const [failure,setFailure]=useState<{readonly scope:string;readonly message:string}>();
  const [retry,setRetry]=useState<{readonly scope:string;readonly sequence:number}>({scope:"",sequence:0});
  const consumed=useRef(0),settled=useRef<Promise<void>>(Promise.resolve()),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    const force=retry.scope===scope&&retry.sequence>consumed.current;
    if(!enabled||!gateway||!page||!page.pendingCount&&!(force&&page.errorCount))return;
    let current=true;
    const timer=window.setTimeout(()=>{
      void (async()=>{
        await settled.current;if(!current)return;
        if(force)consumed.current=retry.sequence;
        try{
          const promise=gateway.prepareWritingNoteCatalog({scope,...(force?{retryErrors:true}:{})});
          settled.current=promise.then(()=>undefined,()=>undefined);
          const result=await promise;
          if(alive.current){
            if(current)setFailure(result.pendingCount&&result.processedCount===0?{scope,message:"writing_note_catalog_preparation_stalled：目录准备未前进，请重新读取后重试。"}:undefined);
            onPrepared();
          }
        }catch(reason){if(current&&alive.current)setFailure({scope,message:catalogErrorMessage(reason)});}
      })();
    },250);
    return()=>{current=false;window.clearTimeout(timer);};
  },[gateway,enabled,scope,page?.revisions.writing,page?.pendingCount,page?.errorCount,retry,onPrepared]);
  return{error:failure?.scope===scope?failure.message:undefined,retry:useCallback(()=>setRetry(value=>({scope,sequence:value.sequence+1})),[scope])};
}
