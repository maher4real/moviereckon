import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistProvider, useWatchlist, type WatchlistItem } from "./useWatchlist";

const mocks = vi.hoisted(() => ({
  fetchWatchlist:vi.fn(), toggleWatchlistItem:vi.fn(), reorderWatchlist:vi.fn(),
  removeWatchlistItem:vi.fn(), markWatchlistItemWatched:vi.fn(), toast:vi.fn(),
}));
vi.mock("./useAuth", () => ({ useAuth: () => ({user:{id:"qa-user"}}) }));
vi.mock("@/frontend/hooks/use-toast", () => ({ useToast: () => ({toast:mocks.toast}) }));
vi.mock("@/frontend/lib/mongodbClient", () => ({
  fetchWatchlist:mocks.fetchWatchlist,
  toggleWatchlistItem:mocks.toggleWatchlistItem,
  reorderWatchlist:mocks.reorderWatchlist,
  removeWatchlistItem:mocks.removeWatchlistItem,
  markWatchlistItemWatched:mocks.markWatchlistItemWatched,
}));
function item(contentId:number, position=0):WatchlistItem {
  return {id:`qa-${contentId}`,user_id:"qa-user",content_id:contentId,content_type:"movie",title:`QA ${contentId}`,poster_path:null,added_at:"2026-09-05T00:00:00Z",position,watched:false};
}
function deferred<T>() {
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(accept=>{resolve=accept});
  return {promise,resolve};
}
const wrapper=({children}:{children:ReactNode})=><WatchlistProvider>{children}</WatchlistProvider>;

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.fetchWatchlist.mockResolvedValue([item(1),item(2,1)]);
  mocks.toggleWatchlistItem.mockImplementation(async (value:{content_id:number})=>({ok:true,action:"added",data:item(value.content_id,2)}));
  mocks.reorderWatchlist.mockResolvedValue(true);
});
afterEach(cleanup);

describe("watchlist concurrent mutation QA",()=>{
  it("keeps a concurrently added title when an earlier reorder fails",async()=>{
    const reorder=deferred<boolean>();mocks.reorderWatchlist.mockReturnValue(reorder.promise);
    const {result}=renderHook(useWatchlist,{wrapper});
    await waitFor(()=>expect(result.current.items).toHaveLength(2));
    let pendingReorder!:Promise<void>;
    act(()=>{pendingReorder=result.current.reorder([...result.current.items].reverse());});
    const handledReorder=pendingReorder.catch(()=>undefined);
    await act(async()=>{await result.current.toggleItem({content_id:3,content_type:"movie",title:"QA 3",poster_path:null});});
    expect(result.current.items.map(entry=>entry.content_id)).toContain(3);
    await act(async()=>{reorder.resolve(false);await handledReorder;});
    expect(result.current.items.map(entry=>entry.content_id)).toEqual([1,2,3]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({variant:"destructive"}));
  });

  it("does not let an older same-account refresh erase a newer optimistic addition",async()=>{
    const refresh=deferred<WatchlistItem[]>();
    const save=deferred<{ok:boolean;action:string;data:WatchlistItem}>();
    const {result}=renderHook(useWatchlist,{wrapper});
    await waitFor(()=>expect(result.current.items).toHaveLength(2));
    mocks.fetchWatchlist.mockReturnValueOnce(refresh.promise);
    mocks.toggleWatchlistItem.mockReturnValueOnce(save.promise);
    let pendingRefresh!:Promise<void>, pendingSave!:Promise<void>;
    act(()=>{pendingRefresh=result.current.refresh();});
    act(()=>{pendingSave=result.current.toggleItem({content_id:3,content_type:"movie",title:"QA 3",poster_path:null});});
    expect(result.current.items.map(entry=>entry.content_id)).toContain(3);
    await act(async()=>{refresh.resolve([item(1),item(2,1)]);await pendingRefresh;});
    expect(result.current.items.map(entry=>entry.content_id)).toContain(3);
    await act(async()=>{save.resolve({ok:true,action:"added",data:item(3,2)});await pendingSave;});
    expect(result.current.items.filter(entry=>entry.content_id===3)).toHaveLength(1);
  });

  it("never duplicates a title when two toggle intents arrive before a render",async()=>{
    const first=deferred<{ok:boolean;action:string;data?:WatchlistItem}>();
    const second=deferred<{ok:boolean;action:string;data?:WatchlistItem}>();
    const {result}=renderHook(useWatchlist,{wrapper});
    await waitFor(()=>expect(result.current.items).toHaveLength(2));
    mocks.toggleWatchlistItem.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    let a!:Promise<void>,b!:Promise<void>;
    act(()=>{const value={content_id:3,content_type:"movie" as const,title:"QA 3",poster_path:null};a=result.current.toggleItem(value);b=result.current.toggleItem(value);});
    expect(result.current.items.filter(entry=>entry.content_id===3).length).toBeLessThanOrEqual(1);
    await act(async()=>{first.resolve({ok:true,action:"added",data:item(3,2)});second.resolve({ok:true,action:"removed"});await Promise.all([a,b]);});
    expect(result.current.items.filter(entry=>entry.content_id===3)).toHaveLength(0);
  });
});
