import { DestroyRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { Queue } from '../queue/queue';
import { PULL_ANSWER_MS, PageRefresh, PullOutcome, Refreshable } from './page-refresh';

/** A resource stand-in: loading from its reload until `done()`. */
function source() {
  const loading = signal(false);
  return {
    reload: vi.fn(() => loading.set(true)),
    isLoading: loading.asReadonly(),
    done: () => loading.set(false),
  } satisfies Refreshable & { done(): void };
}

/** A DestroyRef the test destroys by hand. */
function destroyable() {
  const callbacks: (() => void)[] = [];
  return {
    ref: { onDestroy: (callback: () => void) => callbacks.push(callback) } as unknown as DestroyRef,
    destroy: () => callbacks.forEach((callback) => callback()),
  };
}

describe('PageRefresh', () => {
  let refresh: PageRefresh;
  let backend: HttpTestingController;
  const send = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    send.mockClear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Queue, useValue: { send } }] });
    refresh = TestBed.inject(PageRefresh);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    vi.useRealTimers();
  });

  it('with an answer from the server, asks every registered source again and sends the queue; done once they have their data', async () => {
    const a = source();
    const b = source();
    refresh.add([a, b], destroyable().ref);

    let outcome: PullOutcome | null = null;
    const pulled = refresh.pull().then((o) => (outcome = o));
    backend.expectOne('/api/version').flush({ version: 'dev26.0.0.0002', apiLevel: 1 });
    await vi.waitFor(() => expect(b.reload).toHaveBeenCalledOnce());
    expect(a.reload).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();

    a.done();
    TestBed.tick();
    await Promise.resolve();
    expect(outcome).toBeNull(); // b still loading
    b.done();
    TestBed.tick();
    await pulled;
    expect(outcome).toBe('refreshed');
  });

  it('without an answer in 3.5 s, gives up: nothing is asked again', async () => {
    vi.useFakeTimers();
    const a = source();
    refresh.add([a], destroyable().ref);

    const pulled = refresh.pull();
    const request = backend.expectOne('/api/version');
    await vi.advanceTimersByTimeAsync(PULL_ANSWER_MS);
    expect(await pulled).toBe('unreachable');
    expect(request.cancelled).toBe(true);
    expect(a.reload).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('an error from the server (no network, 502) is no answer either', async () => {
    const a = source();
    refresh.add([a], destroyable().ref);

    const pulled = refresh.pull();
    backend.expectOne('/api/version').error(new ProgressEvent('error'));
    expect(await pulled).toBe('unreachable');
    expect(a.reload).not.toHaveBeenCalled();
  });

  it('forgets the sources of a component that is gone', async () => {
    const gone = source();
    const page = destroyable();
    refresh.add([gone], page.ref);
    page.destroy();

    const pulled = refresh.pull();
    backend.expectOne('/api/version').flush({ version: 'dev26.0.0.0002', apiLevel: 1 });
    expect(await pulled).toBe('refreshed');
    expect(gone.reload).not.toHaveBeenCalled();
  });
});
