import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { Session } from './session';

/**
 * The admin view (design-accounts.md, "Web: /admin"): for an administrator acting as itself. A user,
 * or anyone during an impersonation, gets no match, so `/admin` answers like an address that does
 * not exist (the 404 page), as the API's admin routes do. Signed out: the sign-in page first.
 */
export const adminGuard: CanMatchFn = async () => {
  const session = inject(Session);
  const router = inject(Router);
  const user = await session.load();
  if (!user) return router.createUrlTree(['/login'], { queryParams: { next: '/admin' } });
  return session.canAdminister();
};
