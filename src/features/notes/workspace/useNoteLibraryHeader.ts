import { useLayoutEffect, useState, type RefObject } from "react";
import { useVisibleLayoutMeasurement, visibleLayoutRect } from "@research-assistant/workbench-sdk/layout";

/** The toolbar keeps its own sticky position; only a pinned header is covered. */
export function useNoteLibraryHeader(root: RefObject<HTMLElement | null>, header: RefObject<HTMLTableSectionElement | null>): boolean {
  const [pinned, setPinned] = useState(false);
  function measure(): void {
    const bounds = visibleLayoutRect(root.current), heading = visibleLayoutRect(header.current);
    if (bounds && heading) setPinned(heading.top <= bounds.top + 0.5);
  }
  useVisibleLayoutMeasurement(() => root.current, measure);
  useLayoutEffect(() => {
    const pane = root.current, head = header.current;
    if (!pane || !head) return;
    pane.addEventListener("scroll", measure, {passive: true});
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(pane); observer?.observe(head);
    return () => { pane.removeEventListener("scroll", measure); observer?.disconnect(); };
  }, [root, header]);
  return pinned;
}
