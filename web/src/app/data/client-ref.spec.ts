import { CLIENT_REF_FORMAT, newClientRef } from './client-ref';

describe('newClientRef', () => {
  it('is a UUID v4, a new one every time', () => {
    const refs = new Set(Array.from({ length: 200 }, () => newClientRef()));
    expect(refs.size).toBe(200);
    for (const ref of refs) expect(ref).toMatch(CLIENT_REF_FORMAT);
  });

  it('works where crypto.randomUUID does not exist (plain http on a home network)', () => {
    const randomUUID = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(newClientRef()).toMatch(CLIENT_REF_FORMAT);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: randomUUID, configurable: true });
    }
  });
});
