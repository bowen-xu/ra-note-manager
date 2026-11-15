import type {NoteIndexItem,NoteIndexQuery} from "@research-assistant/core/notes";
import {NotesGatewayError,UnifiedNoteCatalog,type NotesGateway, type WritingNoteCatalogGateway} from "@research-assistant/data/notes";
import {loadBrowserNoteCatalogRuntime} from "@research-assistant/workbench-sdk/note-storage";

export function createWorkspaceNoteCatalog(notes:Pick<NotesGateway,"pageCatalog">,writing:WritingNoteCatalogGateway|undefined):UnifiedNoteCatalog{
  return new UnifiedNoteCatalog({queryNotePageCatalog:async (query,options)=>{
    if(!notes.pageCatalog)throw new NotesGatewayError("source_unavailable","note_catalog_adapter_unavailable：当前笔记存储未提供分页目录。");
    return notes.pageCatalog.queryNotePageCatalog(query,options);
  }},writing,loadBrowserNoteCatalogRuntime);
}

/** Explicit select-all only. Automatic list loading must never call this. */
export async function collectNoteCatalogSelection(catalog:UnifiedNoteCatalog,query:NoteIndexQuery,signal?:AbortSignal):Promise<readonly NoteIndexItem[]>{
  const {cursor:_cursor,...base}=query,items:NoteIndexItem[]=[];let cursor:string|undefined;
  try{
    do{
      signal?.throwIfAborted();
      const page=await catalog.query({...base,limit:200,...(cursor?{cursor}:{})},{...(signal?{signal}:{})});
      if(page.pendingCount||page.errorCount)throw new NotesGatewayError("index_busy",`note_catalog_selection_incomplete：目录尚有${page.pendingCount}篇待准备、${page.errorCount}篇读取失败，请完成准备后再全选。${page.issues[0]?.cause??""}`);
      items.push(...page.items);cursor=page.nextCursor;
    }while(cursor);
    return items;
  }finally{catalog.clear();}
}
