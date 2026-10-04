import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { RUNS_IN_APP } from './address';
import { ServerAddress } from './server-address';

/**
 * In the Android app, the API's paths go to the server address (design-android.md, "API calls"):
 * `/api/substances` → `https://tracker.example.com/api/substances`. Absolute, on another origin than
 * the app's own pages, they go through Android's network stack (native requests, with the session
 * cookie in Android's store). The website's calls are untouched.
 */
export const serverAddressInterceptor: HttpInterceptorFn = (req, next) => {
  if (!inject(RUNS_IN_APP) || !(req.url.startsWith('/api/') || req.url.startsWith('/download/'))) return next(req);
  const address = inject(ServerAddress).address();
  return next(address ? req.clone({ url: address + req.url }) : req);
};
