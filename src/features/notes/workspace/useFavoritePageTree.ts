import { useEffect, useMemo, useState } from "react";
import { navigationPageLinks, readingNoteDisplayTitle, noteBlockId, type NoteIndexItem, type NotePageId, type NavigationPageLink } from "@research-assistant/core/notes";
import type { NoteDocumentSnapshot } from "@research-assistant/data/notes";
import { useNoteResources, useNoteResourceVersion } from "@research-assistant/workbench-sdk/note-resources";
import {useWorkspaceState, workspaceStringSet} from "@research-assistant/workbench-sdk/workspace-state";

export interface FavoriteTreeRow {
  readonly id: string; readonly item: NoteIndexItem; readonly depth: number; readonly parentId?: string;
  readonly parentPageId?: NotePageId; readonly link?: NavigationPageLink; readonly ancestors: readonly string[];
  readonly expanded: boolean; readonly cycle: boolean; readonly hasPageLinks: boolean;
}
interface LoadedPage { readonly snapshot?: NoteDocumentSnapshot; readonly error?: string; readonly title?: string }
export function useFavoritePageTree(items: readonly NoteIndexItem[]) {
  const client = useNoteResources(), version = useNoteResourceVersion();
  const [expanded, setExpanded] = useWorkspaceState("note-favorites-expanded",new Set<string>() as ReadonlySet<string>,workspaceStringSet);
  const [loaded, setLoaded] = useState<ReadonlyMap<NotePageId, LoadedPage>>(new Map());
  const [retry, setRetry] = useState(0);
  const rows = useMemo(() => {
    const result: FavoriteTreeRow[] = [];
    function visit(item: NoteIndexItem, id: string, depth: number, ancestors: readonly string[], parent?: FavoriteTreeRow, link?: NavigationPageLink): void {
      if (item.target.kind === "writing") return;
      const pageId = item.target.pageId, cycle = ancestors.includes(pageId);
      const page = loaded.get(pageId)?.snapshot;
      const links = page ? navigationPageLinks(page.document) : [];
      const row: FavoriteTreeRow = { id, item, depth, ancestors, expanded: expanded.has(id) && !cycle, cycle, hasPageLinks: links.length > 0,
        ...(parent && parent.item.target.kind !== "writing" ? { parentId: parent.id, parentPageId: parent.item.target.pageId } : {}), ...(link ? { link } : {}) };
      result.push(row);
      if (!row.expanded || !page || depth >= 32) return;
      for (const child of links) {
        const childPage = loaded.get(child.pageId)?.snapshot?.page;
        const childItem: NoteIndexItem = items.find(value => value.target.kind !== "writing" && value.target.pageId === child.pageId) ?? {
          id: `page:${child.pageId}`, title: loaded.get(child.pageId)?.title ?? childPage?.title ?? child.label ?? "无标题", snippet: "",
          category: "independent", updatedAt: childPage?.updatedAt ?? "", status: childPage?.status ?? "active", isFavorite: childPage?.isFavorite ?? false,
          target: { kind: "page", pageId: child.pageId },
        };
        visit(childItem, `${id}/${child.blockId}`, depth + 1, [...ancestors, pageId], row, child);
      }
    }
    items.forEach(item => visit(item, item.id, 0, [])); return result;
  }, [items, expanded, loaded]);
  const pageIds = useMemo(() => [...new Set(rows.filter(row => row.item.target.kind !== "writing").map(row => (row.item.target as { pageId: NotePageId }).pageId))], [rows]);
  const identity = pageIds.join("\0");
  useEffect(() => {
    let current = true;
    // Inspect visible rows so only pages with block links get a disclosure.
    // Descendants remain lazy until expanded; these are read-only projections,
    // never editable document copies. Version changes refresh link availability.
    void Promise.all(pageIds.map(async id => {
      try {
        const snapshot = await client.gateway.loadDocument(id);
        let title = snapshot.page.title;
        try { const reading = await client.gateway.getReadingNote(noteBlockId(id)); title = readingNoteDisplayTitle(reading, title); } catch { /* Ordinary pages have no reading source. */ }
        return [id, { snapshot, title }] as const;
      } catch (reason) { return [id, { error: reason instanceof Error ? reason.message : String(reason) }] as const; }
    })).then(values => { if (current) setLoaded(new Map<NotePageId, LoadedPage>(values)); });
    return () => { current = false; };
  }, [client, version, identity, retry]);
  return { rows, loaded, toggle(id: string) { setExpanded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); },
    retry: () => setRetry(value => value + 1), client };
}
