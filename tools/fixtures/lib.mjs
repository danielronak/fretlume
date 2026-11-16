// Helpers for building media fixtures that Chromium can use as a fake camera / microphone.
// Later phases feed these with rendered frames and synthesized guitar audio.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Run ffmpeg and fail loudly with its stderr. */
export function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    encoding: 'utf8',
  });
  if (result.error) throw new Error(`ffmpeg could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffmpeg failed (${result.status}): ${result.stderr}`);
}

function ensureDir(file) {
  mkdirSync(dirname(file), { recursive: true });
}

/**
 * PNG frame sequence -> Motion-JPEG file (the compact format Chromium accepts with
 * --use-file-for-fake-video-capture). `pattern` is an ffmpeg pattern such as "frames/%05d.png".
 */
export function pngSequenceToMjpeg(pattern, outFile, { fps = 30, quality = 3 } = {}) {
  ensureDir(outFile);
  ffmpeg(['-framerate', String(fps), '-i', pattern, '-c:v', 'mjpeg', '-q:v', String(quality), '-f', 'mjpeg', outFile]);
}

/** PNG frame sequence -> uncompressed .y4m (large: ~1.4 MB per 720p frame; use for exact-pixel tests). */
export function pngSequenceToY4m(pattern, outFile, { fps = 30 } = {}) {
  ensureDir(outFile);
  ffmpeg(['-framerate', String(fps), '-i', pattern, '-pix_fmt', 'yuv420p', '-f', 'yuv4mpegpipe', outFile]);
}

/** Built-in ffmpeg test pattern -> Motion-JPEG. Deterministic, no input files needed. */
export function testPatternToMjpeg(outFile, { width = 1280, height = 720, fps = 30, seconds = 1, quality = 4 } = {}) {
  ensureDir(outFile);
  ffmpeg([
    '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=${fps}`,
    '-t', String(seconds), '-c:v', 'mjpeg', '-q:v', String(quality), '-f', 'mjpeg', outFile,
  ]);
}

/** Mono float samples in [-1, 1] -> 16-bit PCM WAV, written without ffmpeg. */
export function floatsToWav(samples, sampleRate, outFile) {
  ensureDir(outFile);
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  writeFileSync(outFile, buffer);
}

/** A pure sine tone, with short fades so the loop point does not click. */
export function sineTone(fHz, seconds, sampleRate, amplitude = 0.5) {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  const fade = Math.round(0.01 * sampleRate);
  for (let i = 0; i < n; i++) {
    const envelope = Math.min(1, i / fade, (n - 1 - i) / fade);
    out[i] = amplitude * envelope * Math.sin((2 * Math.PI * fHz * i) / sampleRate);
  }
  return out;
}
