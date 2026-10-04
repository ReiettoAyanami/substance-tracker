import { InjectionToken } from '@angular/core';

import { IS_APP } from '../platform';

/**
 * Whether these pages run in the Android app (platform.ts), as something a test can change. The
 * app's own pieces (design-android.md, "app") ask this; the website never has them.
 */
export const RUNS_IN_APP = new InjectionToken<boolean>('RUNS_IN_APP', { factory: () => IS_APP });

/** Why a typed server address cannot be used (design-android.md, "server address"). */
export type AddressProblem = 'empty' | 'invalid' | 'http';

/**
 * The server address as the app keeps it: the origin of what was typed
 * (`tracker.example.com/lenzi` → `https://tracker.example.com`); without a scheme, https. Plain http
 * only where it is allowed (the dev app): over http the session cookie would travel in clear.
 */
export function parseAddress(typed: string, allowHttp: boolean): { address: string } | { problem: AddressProblem } {
  const text = typed.trim();
  if (!text) return { problem: 'empty' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { problem: 'invalid' };
  }
  if (url.protocol === 'http:') return allowHttp ? { address: url.origin } : { problem: 'http' };
  if (url.protocol !== 'https:' || !url.hostname) return { problem: 'invalid' };
  return { address: url.origin };
}
