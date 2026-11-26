/// <reference lib="webworker" />
/**
 * NeckNet in its own worker (field test 2026-11-26): the vision worker hands it a frame for the
 * watchdog or a re-find and keeps tracking; the detection comes back when it is ready.
 */
import { detectNeck, type NeckDetection } from './neckNet';
import { Network, type Manifest } from './nn';
import type { Image } from './image';

declare const self: DedicatedWorkerGlobalScope;

export type ToDetect =
  { type: 'load'; modelUrl: string } | { type: 'detect'; id: number; image: Image };
export type FromDetect =
  | { type: 'ready'; ok: boolean }
  | { type: 'detection'; id: number; det: NeckDetection; ms: number };

let net: Network | null = null;

self.onmessage = async (event: MessageEvent<ToDetect>) => {
  const m = event.data;
  if (m.type === 'load') {
    try {
      const [manifest, bin] = await Promise.all([
        fetch(`${m.modelUrl}.json`).then((r) => r.json() as Promise<Manifest>),
        fetch(`${m.modelUrl}.bin`).then((r) => r.arrayBuffer()),
      ]);
      net = Network.fromBuffers(manifest, bin);
      self.postMessage({ type: 'ready', ok: true } satisfies FromDetect);
    } catch {
      self.postMessage({ type: 'ready', ok: false } satisfies FromDetect);
    }
    return;
  }
  if (!net) return;
  const started = performance.now();
  const det = detectNeck(net, m.image);
  self.postMessage({
    type: 'detection',
    id: m.id,
    det,
    ms: performance.now() - started,
  } satisfies FromDetect);
};
