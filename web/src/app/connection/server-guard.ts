import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';

import { RUNS_IN_APP } from './address';
import { ServerAddress } from './server-address';

/**
 * In the Android app, nothing opens before a server address is chosen (design-android.md, "First
 * launch"): the server screen first. It goes before the session's guards on every route, as
 * canActivate or canMatch. The website always passes.
 */
export const serverGuard = (): true | UrlTree => {
  if (!inject(RUNS_IN_APP) || inject(ServerAddress).address()) return true;
  return inject(Router).createUrlTree(['/server']);
};
