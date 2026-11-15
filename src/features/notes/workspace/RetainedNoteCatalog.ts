import type {NoteIndexQuery} from "@research-assistant/core/notes";
import {NotesGatewayError, type UnifiedNoteCatalogPage} from "@research-assistant/data/notes";

interface CatalogReader {
  query(query: NoteIndexQuery, options?: {readonly signal?: AbortSignal}): Promise<UnifiedNoteCatalogPage>;
  clear(): void;
}
interface CachedPage {readonly version: number;readonly refresh: number;readonly page: UnifiedNoteCatalogPage}
interface Pending {readonly key: string;readonly cursor: string | undefined;readonly version: number;readonly refresh: number;readonly controller: AbortController;promise: Promise<UnifiedNoteCatalogPage>}
/** A workspace retains only requested metadata pages, never an eager body index.
 * Hidden work cancels further preparation after the dispatched storage batch;
 * adapters without cancellation may finish their call. Resuming an unchanged
 * successful query is synchronous and does not validate it by reading again. */
export class RetainedNoteCatalog {
  private readonly cache = new Map<string,CachedPage>();
  private running: Pending | undefined;
  private settled: Promise<void> = Promise.resolve();
  private generation: string | undefined;
  constructor(private readonly reader: CatalogReader) {}

  suspend(): void {this.running?.controller.abort();this.running=undefined;}
  dispose(): void {this.suspend();this.cache.clear();this.reader.clear();}

  read(query: NoteIndexQuery, version: number, refresh: number, more = false): Promise<UnifiedNoteCatalogPage> {
    const key=JSON.stringify([query.category,query.view,query.search,query.sort?.field,query.sort?.direction,query.limit??20]);
    const previous=this.cache.get(key), cached=previous?.version===version&&previous.refresh===refresh?previous:undefined;
    if(cached&&(!more||!cached.page.nextCursor)){this.suspend();return Promise.resolve(cached.page);}
    const cursor=more?cached?.page.nextCursor:undefined;
    if(this.running?.key===key&&this.running.cursor===cursor&&this.running.version===version&&this.running.refresh===refresh)return this.running.promise;
    this.suspend();
    const controller=new AbortController();
    let current:Pending;
    const check=()=>controller.signal.throwIfAborted();
    const promise=this.settled.then(async()=>{
      check();const generation=`${version}:${refresh}`;
      if(this.generation!==generation){this.generation=generation;this.cache.clear();this.reader.clear();}
      let page:UnifiedNoteCatalogPage;
      try{
        page=await this.reader.query({...query,...(cursor?{cursor}:{})},{signal:controller.signal});check();
        if(cursor&&cached)page={...page,items:[...cached.page.items,...page.items]};
      }catch(reason){
        check();
        if(!(cursor&&reason instanceof NotesGatewayError&&reason.code==="revision_conflict"))throw reason;
        this.cache.clear();this.reader.clear();
        page=await this.reader.query(query,{signal:controller.signal});check();
      }
      this.cache.delete(key);this.cache.set(key,{version,refresh,page});
      if(this.cache.size>8)this.cache.delete(this.cache.keys().next().value!);
      return page;
    }).finally(()=>{if(this.running===current)this.running=undefined;});
    current={key,cursor,version,refresh,controller,promise};
    this.running=current;this.settled=current.promise.then(()=>undefined,()=>undefined);return current.promise;
  }
}
