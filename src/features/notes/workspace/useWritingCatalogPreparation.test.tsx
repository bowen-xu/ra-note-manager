// @vitest-environment happy-dom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NotesGatewayError,type UnifiedNoteCatalogPage,type WritingNoteCatalogPreparationOptions} from "@research-assistant/data/notes";
import {useWritingCatalogPreparation} from "./useWritingCatalogPreparation";
let root:ReturnType<typeof createRoot>,host:HTMLDivElement,output:ReturnType<typeof useWritingCatalogPreparation>;
const prepare=vi.fn(),onPrepared=vi.fn(),gateway={prepareWritingNoteCatalog:prepare,queryWritingNoteCatalog:vi.fn()};
const page=(pendingCount=17,errorCount=0,revision=1):UnifiedNoteCatalogPage=>({items:[],revisions:{pages:1,writing:revision},pendingCount,errorCount,issues:[]});
function Harness({enabled=true,value=page(),scope="active"}:{enabled?:boolean;value?:UnifiedNoteCatalogPage;scope?:NonNullable<WritingNoteCatalogPreparationOptions['scope']>}){
  output=useWritingCatalogPreparation({gateway,page:value,scope,enabled,onPrepared});return<div>{output.error}</div>;
}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);prepare.mockReset().mockResolvedValue({processedCount:8,pendingCount:9,errorCount:0});onPrepared.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
it('yields the initial ready list before one bounded scope-specific batch',async()=>{
  await act(async()=>root.render(<Harness scope="archived"/>));expect(prepare).not.toHaveBeenCalled();await act(async()=>vi.advanceTimersByTime(250));
  expect(prepare).toHaveBeenCalledExactlyOnceWith({scope:'archived'});expect(onPrepared).toHaveBeenCalledOnce();
  await act(async()=>root.render(<Harness scope="archived" value={page(9,0,2)}/>));await act(async()=>vi.advanceTimersByTime(250));expect(prepare).toHaveBeenCalledTimes(2);
});
it('does not prepare ready or errored resources automatically',async()=>{
  await act(async()=>root.render(<Harness value={page(0,3)}/>));await act(async()=>vi.advanceTimersByTime(1000));expect(prepare).not.toHaveBeenCalled();
  await act(async()=>output.retry());await act(async()=>vi.advanceTimersByTime(250));expect(prepare).toHaveBeenCalledExactlyOnceWith({scope:'active',retryErrors:true});
});
it('cancels an unstarted batch when the view is hidden',async()=>{
  await act(async()=>root.render(<Harness/>));await act(async()=>root.render(<Harness enabled={false}/>));await act(async()=>vi.advanceTimersByTime(1000));expect(prepare).not.toHaveBeenCalled();
});
it('drains an uncancellable batch before starting work for a new visible scope',async()=>{
  let release!:(value:unknown)=>void;prepare.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));
  await act(async()=>root.render(<Harness/>));await act(async()=>vi.advanceTimersByTime(250));await act(async()=>root.render(<Harness scope="archived"/>));await act(async()=>vi.advanceTimersByTime(250));expect(prepare).toHaveBeenCalledOnce();
  await act(async()=>release({processedCount:8,pendingCount:9,errorCount:0}));expect(prepare).toHaveBeenCalledTimes(2);expect(prepare.mock.calls[1]![0]).toEqual({scope:'archived'});
});
it('records invalidation after a hidden dispatched batch but starts no follow-up',async()=>{
  let release!:(value:unknown)=>void;prepare.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));await act(async()=>root.render(<Harness/>));await act(async()=>vi.advanceTimersByTime(250));await act(async()=>root.render(<Harness enabled={false}/>));
  await act(async()=>release({processedCount:8,pendingCount:9,errorCount:0}));expect(onPrepared).toHaveBeenCalledOnce();await act(async()=>vi.advanceTimersByTime(2000));expect(prepare).toHaveBeenCalledOnce();
});
it('preserves a concrete failure and only retries it on intent',async()=>{
  prepare.mockRejectedValueOnce(new NotesGatewayError('source_unavailable','operation=prepare-7 HTTP 503'));
  await act(async()=>root.render(<Harness/>));await act(async()=>vi.advanceTimersByTime(250));expect(output.error).toContain('prepare-7');expect(output.error).toContain('source_unavailable');
  await act(async()=>vi.advanceTimersByTime(5000));expect(prepare).toHaveBeenCalledOnce();await act(async()=>output.retry());await act(async()=>vi.advanceTimersByTime(250));expect(prepare).toHaveBeenCalledTimes(2);expect(output.error).toBeUndefined();
});
it('stops a stalled preparation instead of continuously rereading the same files',async()=>{
  prepare.mockResolvedValue({processedCount:0,pendingCount:17,errorCount:0});await act(async()=>root.render(<Harness/>));await act(async()=>vi.advanceTimersByTime(250));expect(output.error).toContain('preparation_stalled');
  await act(async()=>vi.advanceTimersByTime(5000));expect(prepare).toHaveBeenCalledOnce();
});
