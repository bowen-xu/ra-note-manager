import {useLayoutEffect, useState} from "react";

/** View-owned continuations may expire; already admitted Core work still owns
 * its receipts. Count synchronously so close cannot miss overlapping actions. */
export function useNoteWorkspaceOperations(active: boolean) {
  const [owner] = useState(() => ({mounted: true, active, generation: 0, pending: 0}));
  useLayoutEffect(() => {
    owner.mounted = true; owner.active = active; owner.generation++;
    return () => { owner.mounted = false; owner.generation++; };
  }, [owner, active]);
  const [operations] = useState(() => ({
    capture() {
      const generation = owner.generation;
      return () => owner.mounted && owner.active && owner.generation === generation;
    },
    hasPending: () => owner.pending > 0,
    async run<T>(operation: () => Promise<T>): Promise<T> {
      owner.pending++;
      try { return await operation(); }
      finally { owner.pending--; }
    },
  }));
  return operations;
}
