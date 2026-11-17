/**
 * Camera capture for the Stage (docs/specs/01-vision.md §3, phase 3 task 3.5): one stream at a time,
 * 1280×720 preferred, the back camera on phones. Frames stay on the device.
 */
import { classifyError } from '@audio/microphone';

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'running'
  | 'denied'
  | 'unavailable'
  | 'no-device'
  | 'busy'
  | 'lost'
  | 'error';

export interface CameraDevice {
  id: string;
  label: string;
}

export interface CameraSnapshot {
  status: CameraStatus;
  deviceId: string;
  devices: CameraDevice[];
  width: number;
  height: number;
  message?: string;
}

const INITIAL: CameraSnapshot = { status: 'idle', deviceId: '', devices: [], width: 0, height: 0 };

export function videoConstraints(deviceId: string): MediaTrackConstraints {
  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
  };
}

class Camera {
  private snapshot: CameraSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  stream: MediaStream | null = null;

  getSnapshot = (): CameraSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<CameraSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  async start(deviceId = this.snapshot.deviceId): Promise<MediaStream | null> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.set({ status: 'unavailable' });
      return null;
    }
    this.stop();
    this.set({ status: 'requesting', deviceId });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints(deviceId),
        audio: false,
      });
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings() ?? {};
      track?.addEventListener('ended', () => {
        if (this.stream === stream) this.set({ status: 'lost' });
      });
      const devices = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
      this.set({
        status: 'running',
        deviceId: settings.deviceId ?? deviceId,
        devices,
        width: settings.width ?? 0,
        height: settings.height ?? 0,
      });
      return stream;
    } catch (error) {
      this.set({
        status: classifyError(error),
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.snapshot.status === 'running' || this.snapshot.status === 'lost')
      this.set({ status: 'idle' });
  }
}

export const camera = new Camera();
