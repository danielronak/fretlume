/**
 * React binding of the session engine: keeps the state and runs its clock (a tick every 100 ms while
 * playing; the reducer itself is time-exact, see session.ts).
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createSession, reduce, type SessionAction, type SessionState, type Step } from './session';

type Without<A> = A extends { tMs: number } ? Omit<A, 'tMs'> : never;
export type SessionCommand = Without<SessionAction>;

export function useSession<T>(
  steps: Step<T>[],
  options: { loop?: boolean; bpm?: number; beatsPerBar?: number } = {},
): [SessionState<T>, (command: SessionCommand) => void] {
  const [state, dispatchRaw] = useReducer(
    (s: SessionState<T>, a: SessionAction) => reduce(s, a),
    undefined,
    () => createSession(steps, options),
  );
  const dispatch = useCallback(
    (command: SessionCommand) =>
      dispatchRaw({ ...command, tMs: performance.now() } as SessionAction),
    [],
  );
  // New steps (another item, another setting): keep the position.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dispatch({ type: 'setSteps', steps });
  }, [steps, dispatch]);
  // The clock runs while playing, and while a right attempt in wait-mode is being held.
  const ticking = state.playing || state.passedMs !== null;
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => dispatch({ type: 'tick' }), 100);
    return () => clearInterval(id);
  }, [ticking, dispatch]);
  return [state, dispatch];
}
