import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { NoteIndexItem } from "@research-assistant/core/notes";
import type { MarqueePoint } from "@research-assistant/workbench-sdk/layout";
import "./NoteLibraryWindow.css";
import { useVisibleLayoutMeasurement } from "@research-assistant/workbench-sdk/layout";
import { listWindowBoundary, listWindowOffsets, listWindowRange } from "@research-assistant/workbench-sdk/layout";

interface WindowState { readonly first: number; readonly end: number; readonly pinned: readonly number[] }

/** Row geometry outlives DOM rows: viewport recycling must not erase range selections. */
export function useNoteLibraryWindow(items: readonly NoteIndexItem[], root: RefObject<HTMLElement | null>, scope: string, searching: boolean) {
  const body = useRef<HTMLTableSectionElement>(null);
  const sizes = useRef(new Map<string, number>());
  const [range, setWindow] = useState<WindowState>({first: 0, end: 50, pinned: []});
  const [measurementVersion, remeasure] = useState(0);
  const estimatedHeight = searching ? 76 : 52;
  const offsets = useMemo(() => {
    return listWindowOffsets(items.map(item => item.id), sizes.current, estimatedHeight);
  }, [items, estimatedHeight, measurementVersion]);
  const latest = useRef({items, offsets}); latest.current = {items, offsets};
  const marqueeResult = useRef<{items: readonly NoteIndexItem[]; first: number; last: number; ids: readonly string[]} | undefined>(undefined);

  function boundary(y: number, after: boolean): number {
    return listWindowBoundary(latest.current.offsets, y, after);
  }
  function update(): void {
    const pane = root.current, section = body.current;
    if (!pane || !section) return;
    // The initial batch is already bounded. Hiding must not discard a scrolled window.
    if (!pane.clientHeight) return;
    const paneBounds = pane.getBoundingClientRect(), bodyBounds = section.getBoundingClientRect();
    const headerHeight = section.previousElementSibling?.getBoundingClientRect().height ?? 0;
    const {first, end} = listWindowRange(latest.current.offsets, paneBounds.top + headerHeight - bodyBounds.top, pane.clientHeight - headerHeight);
    // An active control/menu retains its owner until focus leaves or the menu closes.
    const pinned = [...new Set(Array.from(section.querySelectorAll<HTMLElement>(':focus, [aria-expanded="true"]')).flatMap(control => {
      const id = control.closest<HTMLElement>('tr[data-selection-id]')?.dataset.selectionId;
      const index = latest.current.items.findIndex(item => item.id === id);
      return index >= 0 && (index < first || index >= end) ? [index] : [];
    }))].sort((a, b) => a - b);
    setWindow(previous => previous.first === first && previous.end === end && previous.pinned.join() === pinned.join()
      ? previous : {first, end, pinned});
  }
  const updateRef = useRef(update); updateRef.current = update;
  useVisibleLayoutMeasurement(() => root.current, () => updateRef.current());
  useLayoutEffect(() => {
    const pane = root.current, section = body.current;
    if (!pane || !section) return;
    let frame: number | undefined;
    const schedule = () => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => { frame = undefined; updateRef.current(); });
    };
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => { remeasure(value => value + 1); schedule(); });
    resize?.observe(pane); resize?.observe(section);
    const mutation = new MutationObserver(schedule);
    mutation.observe(section, {attributes: true, subtree: true, attributeFilter: ["aria-expanded"]});
    pane.addEventListener("scroll", schedule, {passive: true});
    section.addEventListener("focusin", schedule); section.addEventListener("focusout", schedule);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      resize?.disconnect(); mutation.disconnect(); pane.removeEventListener("scroll", schedule);
      section.removeEventListener("focusin", schedule); section.removeEventListener("focusout", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [root]);
  useLayoutEffect(() => {
    const valid = new Set(items.map(item => item.id));
    for (const id of sizes.current.keys()) if (!valid.has(id)) sizes.current.delete(id);
    updateRef.current();
  }, [items, scope]);
  useLayoutEffect(() => {
    let changed = false;
    for (const row of body.current?.querySelectorAll<HTMLElement>('tr[data-selection-id]') ?? []) {
      const height = row.getBoundingClientRect().height, id = row.dataset.selectionId;
      if (id && height > 0 && sizes.current.get(id) !== height) { sizes.current.set(id, height); changed = true; }
    }
    if (changed) remeasure(value => value + 1);
    else updateRef.current();
  }, [items, range, searching, measurementVersion]);
  function getMarqueeIds(start: MarqueePoint, end: MarqueePoint): readonly string[] | undefined {
    const pane = root.current, section = body.current;
    if (!pane?.clientHeight || !section) return undefined;
    const bounds = section.getBoundingClientRect();
    if (bounds.left >= Math.max(start.clientX, end.clientX) || bounds.right <= Math.min(start.clientX, end.clientX)) return [];
    if (Math.max(start.clientY, end.clientY) <= bounds.top || Math.min(start.clientY, end.clientY) >= bounds.top + latest.current.offsets.at(-1)!) return [];
    const first = Math.max(0, boundary(Math.min(start.clientY, end.clientY) - bounds.top, true) - 1);
    const last = boundary(Math.max(start.clientY, end.clientY) - bounds.top, false);
    const previous = marqueeResult.current;
    if (previous?.items === latest.current.items && previous.first === first && previous.last === last) return previous.ids;
    const ids = latest.current.items.slice(first, last).map(item => item.id);
    marqueeResult.current = {items: latest.current.items, first, last, ids};
    return ids;
  }
  const projection = useMemo(() => {
    const indices = [...new Set([...Array.from({length: Math.max(0, Math.min(items.length, range.end) - range.first)}, (_, i) => range.first + i), ...range.pinned.filter(i => i < items.length)])].sort((a, b) => a - b);
    const rows: {index: number; item: NoteIndexItem; gap: number}[] = [];
    let previousEnd = 0;
    for (const index of indices) {
      rows.push({index, item: items[index]!, gap: offsets[index]! - previousEnd}); previousEnd = offsets[index + 1]!;
    }
    return {rows, bottom: offsets[offsets.length - 1]! - previousEnd};
  }, [items, range, offsets]);
  return {body, ...projection, getMarqueeIds};
}
