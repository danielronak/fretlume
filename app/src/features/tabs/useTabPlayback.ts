/** Play a tab through the synth and follow the playhead (bar, beat) from the audio clock. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { beatIndexAt, timeline, type Tab, type TimedBeat } from '@core/tab/model';
import { TabPlayer, type PlayOptions } from '@audio/tabPlayer';

export interface Playhead {
  bar: number;
  beat: number;
  /** Ticks into the current beat (for approaching rings), and the exact tick. */
  tick: number;
}

export function useTabPlayback(tab: Tab | null) {
  const player = useRef<TabPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [head, setHead] = useState<Playhead | null>(null);
  const beatsRef = useRef<TimedBeat[]>([]);

  useEffect(() => {
    beatsRef.current = tab ? timeline(tab) : [];
  }, [tab]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = -2;
    const loop = () => {
      const pos = player.current?.position();
      if (pos?.playing) {
        const beats = beatsRef.current;
        const i = beatIndexAt(beats, pos.tick);
        if (i !== last) {
          last = i;
          const b = beats[i];
          setHead(b ? { bar: b.bar, beat: b.beat, tick: pos.tick } : null);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const stop = useCallback(() => {
    player.current?.stop();
    setPlaying(false);
    setHead(null);
  }, []);

  const play = useCallback(
    async (options: Omit<PlayOptions, 'onEnd'>) => {
      if (!tab) return;
      player.current ??= new TabPlayer();
      await player.current.play(tab, {
        ...options,
        onEnd: () => {
          setPlaying(false);
          setHead(null);
        },
      });
      setPlaying(true);
    },
    [tab],
  );

  useEffect(() => () => player.current?.stop(), []);

  return { playing, head, play, stop, player };
}
