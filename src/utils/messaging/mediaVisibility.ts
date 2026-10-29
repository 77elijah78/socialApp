import { useSyncExternalStore } from "react";

const owners = new Map<symbol, Set<string>>();
const listeners = new Map<string, Set<() => void>>();
let visible = new Set<string>();
function publish() {
  const next = new Set([...owners.values()].flatMap((ids) => [...ids]));
  const changed = new Set([...visible, ...next]);
  const previous = visible;
  visible = next;
  for (const id of changed)
    if (previous.has(id) !== next.has(id))
      listeners.get(id)?.forEach((listener) => listener());
}
export function setVisibleMedia(owner: symbol, ids: string[]) {
  owners.set(owner, new Set(ids));
  publish();
}
export function clearVisibleMedia(owner: symbol) {
  owners.delete(owner);
  publish();
}
export function useMediaVisibility(id?: string) {
  return useSyncExternalStore(
    (listener) => {
      if (!id) return () => {};
      const group = listeners.get(id) ?? new Set();
      group.add(listener);
      listeners.set(id, group);
      return () => {
        group.delete(listener);
        if (!group.size) listeners.delete(id);
      };
    },
    () => !id || visible.has(id),
    () => true,
  );
}
