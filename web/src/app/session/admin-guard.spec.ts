import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthApi, type SessionUser } from '../data/auth-api';
import { adminGuard } from './admin-guard';

@Component({ selector: 'test-admin', template: 'admin' })
class Admin {}

@Component({ selector: 'test-other', template: 'other' })
class Other {}

describe('adminGuard', () => {
  async function visitAdminAs(user: SessionUser | null) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin', canMatch: [adminGuard], component: Admin },
          { path: 'login', component: Other },
          { path: '**', component: Other },
        ]),
        { provide: AuthApi, useValue: { getSession: () => of(user) } },
      ],
    });
    const harness = await RouterTestingHarness.create('/admin');
    return { url: TestBed.inject(Router).url, text: harness.routeNativeElement?.textContent?.trim() };
  }

  it('an administrator acting as itself: the admin view', async () => {
    expect(await visitAdminAs({ id: 1, username: 'lenzi', role: 'admin', impersonatedBy: null })).toEqual({ url: '/admin', text: 'admin' });
  });

  it('a user, or an administrator being impersonated: no match, like an address that does not exist', async () => {
    expect(await visitAdminAs({ id: 2, username: 'friend', role: 'user', impersonatedBy: null })).toEqual({ url: '/admin', text: 'other' });
  });

  it('during an impersonation, even of an administrator: no match', async () => {
    expect(await visitAdminAs({ id: 3, username: 'chief', role: 'admin', impersonatedBy: 1 })).toEqual({ url: '/admin', text: 'other' });
  });

  it('signed out: the sign-in page first, coming back here', async () => {
    expect((await visitAdminAs(null)).url).toBe('/login?next=%2Fadmin');
  });
});
