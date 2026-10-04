import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { RUNS_IN_APP } from '../connection/address';
import { ServerAddress } from '../connection/server-address';
import { LAST_DATA_BACKEND, LastData, LastDataBackend, StoredAnswer } from './last-data';

class MemoryBackend implements LastDataBackend {
  readonly map = new Map<string, StoredAnswer>();
  async get(key: string) {
    return this.map.get(key);
  }
  async put(key: string, answer: StoredAnswer) {
    this.map.set(key, answer);
  }
  async clear() {
    this.map.clear();
  }
}

describe('LastData', () => {
  let lastData: LastData;
  let phone: MemoryBackend;
  let backend: HttpTestingController;

  function setUp(inApp = true): void {
    phone = new MemoryBackend();
    TestBed.configureTestingModule({
      providers: [
        { provide: RUNS_IN_APP, useValue: inApp },
        { provide: LAST_DATA_BACKEND, useValue: phone },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(ServerAddress).set('https://tracker.example.com');
    lastData = TestBed.inject(LastData);
    backend = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('reads back what it wrote, for that user only', async () => {
    setUp();
    await lastData.write(7, '/api/substances', [{ id: 1 }], '2026-10-04T12:00:00.000Z');
    expect(await lastData.read(7, '/api/substances')).toEqual({ v: 1, at: '2026-10-04T12:00:00.000Z', body: [{ id: 1 }] });
    expect(await lastData.read(8, '/api/substances')).toBeUndefined();
  });

  it('wipes everything at sign out and at a change of server', async () => {
    setUp();
    await lastData.write(7, '/api/substances', [], '2026-10-04T12:00:00.000Z');
    await lastData.wipe();
    expect(phone.map.size).toBe(0);
  });

  it('at launch, reads what recording a consumption offline needs', async () => {
    setUp();
    const done = lastData.refreshForOffline();
    await new Promise((resolve) => setTimeout(resolve));
    backend.expectOne('/api/settings').flush({ timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' });
    await new Promise((resolve) => setTimeout(resolve));
    backend.expectOne('/api/substances').flush([{ id: 2 }, { id: 4 }]);
    await new Promise((resolve) => setTimeout(resolve));
    backend.expectOne('/api/substances/2/batches').flush({ substanceId: 2, batches: [] });
    backend.expectOne('/api/substances/4/batches').flush({ substanceId: 4, batches: [] });
    await done;
  });

  it('the website keeps nothing and reads nothing at launch', async () => {
    setUp(false);
    await lastData.refreshForOffline();
    phone.map.set('x', { v: 1, at: '', body: null });
    await lastData.wipe();
    expect(phone.map.size).toBe(1);
  });
});
