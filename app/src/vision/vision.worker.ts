/// <reference lib="webworker" />
/**
 * Vision worker: frames arrive as ImageBitmaps (transferred), are read once into RGBA pixels and
 * handed to VisionCore. Camera frames never leave this device and are not kept.
 */
import { VisionCore } from './core';
import { Network, type Manifest } from './nn';
import type { Image } from './image';
import type { VisionReply, VisionRequest } from './messages';
import { readFrameStamp } from './stamp';

declare const self: DedicatedWorkerGlobalScope;

const core = new VisionCore();
let autoOn = false;

async function loadNetwork(baseUrl: string): Promise<Network> {
  const [manifest, bin] = await Promise.all([
    fetch(`${baseUrl}.json`).then((r) => r.json() as Promise<Manifest>),
    fetch(`${baseUrl}.bin`).then((r) => r.arrayBuffer()),
  ]);
  return Network.fromBuffers(manifest, bin);
}
let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;

function pixels(frame: ImageBitmap): Image {
  if (!canvas || canvas.width !== frame.width || canvas.height !== frame.height) {
    canvas = new OffscreenCanvas(frame.width, frame.height);
    context = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!context) throw new Error('2d context unavailable');
  context.drawImage(frame, 0, 0);
  frame.close();
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return { width: canvas.width, height: canvas.height, data, channels: 4 };
}

const reply = (message: VisionReply) => self.postMessage(message);

self.onmessage = (event: MessageEvent<VisionRequest>) => {
  const message = event.data;
  const started = performance.now();
  try {
    switch (message.type) {
      case 'instrument':
        core.setInstrument(message.id);
        break;
      case 'lock': {
        const result = core.lock(pixels(message.frame), message.taps, message.scale);
        reply({ type: 'lock', id: message.id, ms: performance.now() - started, ...result });
        break;
      }
      case 'confirm':
        core.confirm(
          message.H,
          message.polarity,
          message.tMs,
          message.scale,
          message.frame ? pixels(message.frame) : undefined,
        );
        break;
      case 'frame': {
        const image = pixels(message.frame);
        if (!core.tracking && autoOn) {
          const status = core.autoLock(image, message.tMs, message.scale);
          if (status) {
            reply({
              type: 'auto',
              state: status.state,
              hint: status.hint,
              H: status.H,
              polarity: status.polarity,
              confidence: status.confidence,
              indexSure: status.indexSure,
              presence: status.detection?.presence ?? 0,
              profile: status.detection?.profile.id ?? null,
              corners: status.detection?.corners ?? [],
              ms: performance.now() - started,
              ...(message.debug ? { stamp: readFrameStamp(image, message.scale) } : {}),
            });
            break;
          }
        }
        const pose = core.track(image, message.tMs, message.scale);
        reply({
          type: 'pose',
          H: pose?.H ?? null,
          controlPoints: pose?.controlPoints ?? [],
          confidence: pose?.confidence ?? 0,
          state: pose?.state ?? 'searching',
          measured: pose?.measured ?? false,
          tCaptureMs: message.tMs,
          ms: performance.now() - started,
          samples: pose?.samples ?? 0,
          ...(message.debug ? { stamp: readFrameStamp(image, message.scale) } : {}),
        });
        break;
      }
      case 'stop':
        core.stop();
        break;
      case 'auto':
        autoOn = message.on;
        core.resetAuto();
        if (message.on)
          loadNetwork(message.modelUrl)
            .then((net) => {
              core.setNetwork(net);
              reply({ type: 'auto-ready', ok: true });
            })
            .catch((error: unknown) => {
              autoOn = false;
              reply({ type: 'auto-ready', ok: false, message: String(error) });
            });
        break;
    }
  } catch (error) {
    if ('frame' in message) message.frame?.close();
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
