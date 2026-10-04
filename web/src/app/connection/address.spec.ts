import { parseAddress } from './address';

describe('parseAddress', () => {
  it('keeps the origin of what was typed, https when no scheme is given', () => {
    expect(parseAddress('  tracker.example.com ', false)).toEqual({ address: 'https://tracker.example.com' });
    expect(parseAddress('https://tracker.example.com/lenzi/metrics?x=1', false)).toEqual({ address: 'https://tracker.example.com' });
    expect(parseAddress('HTTPS://Tracker.Example.com:8443/', false)).toEqual({ address: 'https://tracker.example.com:8443' });
    expect(parseAddress('pc.tail1234.ts.net', false)).toEqual({ address: 'https://pc.tail1234.ts.net' });
  });

  it('refuses http in the release app, takes it in the dev app', () => {
    expect(parseAddress('http://192.168.1.20:8080', false)).toEqual({ problem: 'http' });
    expect(parseAddress('http://192.168.1.20:8080/x', true)).toEqual({ address: 'http://192.168.1.20:8080' });
  });

  it('nothing typed, or not an address', () => {
    expect(parseAddress('   ', false)).toEqual({ problem: 'empty' });
    expect(parseAddress('https://', false)).toEqual({ problem: 'invalid' });
    expect(parseAddress('ftp://tracker.example.com', false)).toEqual({ problem: 'invalid' });
    expect(parseAddress('not an address at all', false)).toEqual({ problem: 'invalid' });
  });
});
