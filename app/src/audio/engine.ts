/**
 * The app's single AudioContext (docs/specs/02-audio.md §1, §5).
 * - Created lazily and resumed only from a user gesture (browsers block audio otherwise).
 * - Suspended while the page is hidden, resumed when it is shown again if it was running.
 * Everything that makes or analyses sound goes through `audioEngine`.
 */

export interface ContextLike {
  readonly state: string;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export class AudioEngine<C extends ContextLike = AudioContext> {
  private ctx: C | null = null;
  private resumeOnShow = false;

  constructor(
    private readonly create: () => C,
    private readonly visibility: VisibilitySource | null,
  ) {
    visibility?.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** The context, created on first use (it starts suspended until `unlock`). */
  context(): C {
    this.ctx ??= this.create();
    return this.ctx;
  }

  get hasContext(): boolean {
    return this.ctx !== null;
  }

  /** Call from a click or key handler: makes sure the context is running. */
  async unlock(): Promise<C> {
    const context = this.context();
    if (context.state !== 'running' && !this.visibility?.hidden) await context.resume();
    return context;
  }

  private readonly onVisibilityChange = () => {
    const context = this.ctx;
    if (!context || !this.visibility) return;
    if (this.visibility.hidden) {
      if (context.state === 'running') {
        this.resumeOnShow = true;
        void context.suspend();
      }
    } else if (this.resumeOnShow) {
      this.resumeOnShow = false;
      void context.resume();
    }
  };

  async dispose(): Promise<void> {
    this.visibility?.removeEventListener('visibilitychange', this.onVisibilityChange);
    const context = this.ctx;
    this.ctx = null;
    if (context && context.state !== 'closed') await context.close();
  }
}

export const audioEngine = new AudioEngine<AudioContext>(
  () => new AudioContext({ latencyHint: 'interactive' }),
  typeof document === 'undefined' ? null : document,
);
