/**
 * Every sound the app makes is announced here with its AudioContext start time, so the listening
 * engine can ignore it (self-masking, docs/specs/02-audio.md §1).
 */
type Listener = (contextTime: number) => void;
const listeners = new Set<Listener>();

export function onAppSound(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function announceAppSound(contextTime: number): void {
  for (const l of listeners) l(contextTime);
}
