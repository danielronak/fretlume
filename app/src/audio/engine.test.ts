import { describe, expect, it } from 'vitest';
import { AudioEngine, type ContextLike, type VisibilitySource } from './engine';

class FakeContext implements ContextLike {
  state = 'suspended';
  calls: string[] = [];
  async resume() {
    this.calls.push('resume');
    this.state = 'running';
  }
  async suspend() {
    this.calls.push('suspend');
    this.state = 'suspended';
  }
  async close() {
    this.calls.push('close');
    this.state = 'closed';
  }
}

class FakeDocument implements VisibilitySource {
  hidden = false;
  private listeners = new Set<() => void>();
  addEventListener(_: 'visibilitychange', listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_: 'visibilitychange', listener: () => void) {
    this.listeners.delete(listener);
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    for (const listener of this.listeners) listener();
  }
  get listenerCount() {
    return this.listeners.size;
  }
}

describe('AudioEngine', () => {
  it('creates the context lazily, once', () => {
    let made = 0;
    const engine = new AudioEngine(() => {
      made++;
      return new FakeContext();
    }, null);
    expect(engine.hasContext).toBe(false);
    expect(engine.context()).toBe(engine.context());
    expect(made).toBe(1);
  });

  it('resumes on unlock', async () => {
    const engine = new AudioEngine(() => new FakeContext(), new FakeDocument());
    const context = await engine.unlock();
    expect(context.state).toBe('running');
  });

  it('suspends while hidden and resumes when shown, only if it was running', async () => {
    const doc = new FakeDocument();
    const engine = new AudioEngine(() => new FakeContext(), doc);
    const context = await engine.unlock();
    doc.setHidden(true);
    expect(context.state).toBe('suspended');
    doc.setHidden(false);
    expect(context.state).toBe('running');

    await context.suspend(); // stopped on purpose
    doc.setHidden(true);
    doc.setHidden(false);
    expect(context.state).toBe('suspended');
  });

  it('does not resume while the page is hidden', async () => {
    const doc = new FakeDocument();
    doc.hidden = true;
    const engine = new AudioEngine(() => new FakeContext(), doc);
    expect((await engine.unlock()).state).toBe('suspended');
  });

  it('closes and unsubscribes on dispose', async () => {
    const doc = new FakeDocument();
    const engine = new AudioEngine(() => new FakeContext(), doc);
    const context = engine.context();
    await engine.dispose();
    expect(context.state).toBe('closed');
    expect(doc.listenerCount).toBe(0);
    expect(engine.hasContext).toBe(false);
  });
});
