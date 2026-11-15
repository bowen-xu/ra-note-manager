import {expect,it,vi} from "vitest";
import type {UnifiedNoteCatalogPage} from "@research-assistant/data/notes";
import {NotesGatewayError} from "@research-assistant/data/notes";
import {RetainedNoteCatalog} from "./RetainedNoteCatalog";
import type {NoteIndexQuery} from "@research-assistant/core/notes";

const q={category:"all",view:"recent",search:"",limit:20} as const;
const page:UnifiedNoteCatalogPage={items:[],revisions:{pages:1},pendingCount:0,errorCount:0,issues:[],nextCursor:"position-1"};
function harness(){const query=vi.fn(async(_query:NoteIndexQuery,_options?:{readonly signal?:AbortSignal})=>page),clear=vi.fn();return{query,clear,owner:new RetainedNoteCatalog({query,clear})};}

it("reuses a successful page on ten unchanged workspace trips",async()=>{
  const h=harness();expect(await h.owner.read(q,0,0)).toBe(page);
  for(let index=0;index<10;index++){h.owner.suspend();expect(await h.owner.read(q,0,0)).toBe(page);}
  expect(h.query).toHaveBeenCalledOnce();expect(h.clear).toHaveBeenCalledOnce();
});
it("keeps separate requested scopes and only invalidates them for a real data/refresh version",async()=>{
  const h=harness();await h.owner.read(q,0,0);await h.owner.read({...q,view:"archive"},0,0);await h.owner.read(q,0,0);
  expect(h.query).toHaveBeenCalledTimes(2);await h.owner.read(q,1,0);await h.owner.read(q,1,1);expect(h.query).toHaveBeenCalledTimes(4);
});
it("coalesces matching requests and retains pagination without requerying earlier pages",async()=>{
  const h=harness(),a=h.owner.read(q,0,0),b=h.owner.read(q,0,0);expect(a).toBe(b);await a;
  await h.owner.read(q,0,0,true);expect(h.query.mock.calls).toHaveLength(2);expect(h.query.mock.calls[1]![0]).toMatchObject({cursor:"position-1",limit:20});
});
it("does not overlap uncancellable storage work during repeated cold trips",async()=>{
  const h=harness();let release!:(page:UnifiedNoteCatalogPage)=>void;
  h.query.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));const first=h.owner.read(q,0,0);void first.catch(()=>{});
  await Promise.resolve();
  const queued:Promise<unknown>[]=[];
  for(let index=0;index<10;index++){h.owner.suspend();const request=h.owner.read(q,0,0);queued.push(request.catch(()=>{}));}
  await Promise.resolve();expect(h.query).toHaveBeenCalledOnce();release(page);await Promise.all([first.catch(()=>{}),...queued]);expect(h.query).toHaveBeenCalledTimes(2);
});
it("does not publish a hidden cold result, or continue queued requests when still hidden",async()=>{
  const h=harness();let release!:(page:UnifiedNoteCatalogPage)=>void;
  h.query.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));const first=h.owner.read(q,0,0);void first.catch(()=>{});await Promise.resolve();
  h.owner.suspend();const queued=h.owner.read(q,0,0);void queued.catch(()=>{});h.owner.suspend();release(page);
  await expect(first).rejects.toMatchObject({name:"AbortError"});await expect(queued).rejects.toMatchObject({name:"AbortError"});
  expect(h.query).toHaveBeenCalledOnce();await h.owner.read(q,0,0);expect(h.query).toHaveBeenCalledTimes(2);
});
it("restarts stale continuation from the first page, rather than appending mixed revisions",async()=>{
  const h=harness();await h.owner.read(q,0,0);h.query.mockRejectedValueOnce(new NotesGatewayError("revision_conflict","note_catalog_changed"));
  expect(await h.owner.read(q,0,0,true)).toBe(page);expect(h.query).toHaveBeenCalledTimes(3);expect(h.query.mock.calls[2]![0]).not.toHaveProperty("cursor");
});
it("retains a previous page after a source error and permits a later explicit refresh",async()=>{
  const h=harness();await h.owner.read(q,0,0);h.query.mockRejectedValueOnce(new Error("operation=fixture-12"));
  await expect(h.owner.read(q,0,0,true)).rejects.toThrow("fixture-12");expect(await h.owner.read(q,0,0)).toBe(page);await h.owner.read(q,0,1);expect(h.query).toHaveBeenCalledTimes(3);
});
it("releases pages and rejects an in-flight result on disposal",async()=>{
  const h=harness();await h.owner.read(q,0,0);h.owner.dispose();await h.owner.read(q,0,0);expect(h.query).toHaveBeenCalledTimes(2);
});
it("bounds cached query scopes to eight",async()=>{
  const h=harness();for(let index=0;index<9;index++)await h.owner.read({...q,search:String(index)},0,0);
  await h.owner.read({...q,search:"0"},0,0);expect(h.query).toHaveBeenCalledTimes(10);
});
