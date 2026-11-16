/** Confirmed story creation only; lets the home Stories bar refresh without a
 * polling loop or a second story cache. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function publishStoryCreated() {
  for (const listener of listeners) listener();
}

export function subscribeStoryCreated(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
