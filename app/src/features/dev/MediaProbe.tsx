import { useEffect, useRef, useState } from 'react';
import { peakFrequencyHz } from '@audio/spectrum';
import { t } from '@i18n/index';
import { Button } from '@ui/index';

type ProbeState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; width: number; height: number; peakHz: number; sampleRate: number }
  | { status: 'error'; message: string };

const FFT_SIZE = 16384;

/**
 * Developer route used by e2e tests (docs/phases/phase-00-bootstrap.md task 0.5):
 * proves that camera frames and microphone samples reach the page.
 */
export function MediaProbe() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const [state, setState] = useState<ProbeState>({ status: 'idle' });

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioRef.current?.close();
    },
    [],
  );

  const start = async () => {
    setState({ status: 'running' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('video element missing');
      video.srcObject = stream;
      await video.play();

      const context = new AudioContext();
      audioRef.current = context;
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      context.createMediaStreamSource(stream).connect(analyser);
      // Let the analyser window fill with real samples before reading it.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const db = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(db);

      setState({
        status: 'done',
        width: video.videoWidth,
        height: video.videoHeight,
        peakHz: peakFrequencyHz(db, context.sampleRate, FFT_SIZE),
        sampleRate: context.sampleRate,
      });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <section className="screen" data-testid="screen-media-probe">
      <h1>{t('probeTitle')}</h1>
      <p className="screen__lede">{t('probeIntro')}</p>
      <div className="row">
        <Button variant="primary" onClick={start} disabled={state.status === 'running'}>
          {t('probeStart')}
        </Button>
        <span data-testid="probe-status" data-status={state.status}>
          {state.status === 'idle' && t('probeIdle')}
          {state.status === 'running' && t('probeRunning')}
          {state.status === 'error' && `${t('probeError')}: ${state.message}`}
        </span>
      </div>
      <video ref={videoRef} className="probe-video" muted playsInline />
      {state.status === 'done' ? (
        <dl className="readout">
          <dt>{t('probeVideo')}</dt>
          <dd data-testid="probe-video-size">
            {state.width}×{state.height}
          </dd>
          <dt>{t('probeAudio')}</dt>
          <dd data-testid="probe-audio-hz">{state.peakHz.toFixed(2)}</dd>
          <dt>{t('probeSampleRate')}</dt>
          <dd data-testid="probe-sample-rate">{state.sampleRate}</dd>
        </dl>
      ) : null}
    </section>
  );
}
