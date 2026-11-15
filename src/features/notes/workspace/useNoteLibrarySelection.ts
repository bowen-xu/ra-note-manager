import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { NoteIndexItem } from "@research-assistant/core/notes";
import { retainRowSelectionIds, updateRowSelection } from "@research-assistant/workbench-sdk/layout";
import { startMarqueeSelection, type MarqueePoint } from "@research-assistant/workbench-sdk/layout";
import { createMarqueeHitTest } from "@research-assistant/workbench-sdk/layout";

export function useNoteLibrarySelection(items: readonly NoteIndexItem[], scope: string, root: RefObject<HTMLElement | null>, disabled: boolean,
  getMarqueeIds?: (start: MarqueePoint, end: MarqueePoint) => readonly string[] | undefined) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | undefined>(undefined), gesture = useRef<(() => void) | undefined>(undefined);
  const current = useRef(selected); current.current = selected;
  const marquee = useRef(getMarqueeIds); marquee.current = getMarqueeIds;
  const ids = useMemo(() => items.map(item => item.id), [items]);
  const validIds = useMemo(() => new Set(ids), [ids]);
  useEffect(() => { gesture.current?.(); setSelected(value => value.size ? new Set() : value); anchor.current = undefined; }, [scope]);
  useEffect(() => { setSelected(value => { const next = retainRowSelectionIds(value, ids); return next.size === value.size ? value : next; }); }, [ids]);
  useEffect(() => { if (disabled) gesture.current?.(); }, [disabled]);
  useEffect(() => () => gesture.current?.(), []);
  const visible = useMemo(() => {
    const next = new Set([...selected].filter(id => validIds.has(id)));
    return next.size === selected.size ? selected : next;
  }, [selected, validIds]);
  const choose = useCallback((id: string, toggle: boolean, range: boolean): void => {
    const next = updateRowSelection({clickedId: id, currentIds: current.current, currentPrimaryId: anchor.current,
      anchorId: anchor.current, extendRange: range, toggle, visibleIds: ids});
    anchor.current = next.anchorId; setSelected(next.selectedIds);
  }, [ids]);
  const clear = useCallback(() => { setSelected(previous => previous.size ? new Set() : previous); anchor.current = undefined; }, []);
  function start(event: ReactPointerEvent<HTMLElement>): void {
    if (disabled || event.button !== 0 || !event.isPrimary || event.pointerType === "touch" || !(event.target instanceof Element) || !root.current) return;
    if (event.target.closest('table, header, .notes-library-actions, button, a, input, textarea, [role="menu"], [role="dialog"]')) return;
    const before = new Set(current.current), additive = event.ctrlKey || event.metaKey || event.shiftKey;
    gesture.current?.();
    const pane = root.current;
    // Virtualized hosts supply geometry; only allocate fallback DOM observers
    // if that host cannot answer (for example an unmeasured initial surface).
    let hitTest: ReturnType<typeof createMarqueeHitTest> | undefined;
    gesture.current = startMarqueeSelection(pane, event.nativeEvent, { autoScroll: true,
      getIds: (start, end) => marquee.current?.(start, end)
        ?? (hitTest ??= createMarqueeHitTest(pane, pane, 'tbody tr[data-selection-id]', row => row.dataset.selectionId)).getIds(start, end),
      onActivate: () => pane.focus({preventScroll: true}),
      onSelect: chosen => setSelected(previous => {
        const next = new Set([...(additive ? before : []), ...chosen]);
        return next.size === previous.size && [...next].every(id => previous.has(id)) ? previous : next;
      }),
      onFinish: (cancelled, activated) => {
        hitTest?.dispose();
        gesture.current = undefined;
        if (cancelled) setSelected(before);
        else if (!activated && !additive) { setSelected(new Set()); anchor.current = undefined; }
      },
    });
  }
  return { selected: visible, choose, start, clear,
    replace: (ids:readonly string[])=>{anchor.current=undefined;setSelected(new Set(ids));},
    remove: (removed: ReadonlySet<string>) => setSelected(value => new Set([...value].filter(id => !removed.has(id)))),
    all: visible.size > 0 && visible.size === ids.length, partial: visible.size > 0 && visible.size < ids.length,
    selectAll: () => setSelected(new Set(ids)), toggleAll: () => setSelected(visible.size === ids.length ? new Set() : new Set(ids)) };
}
