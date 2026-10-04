import { Routes } from '@angular/router';

import { adminGuard } from './session/admin-guard';
import { homeGuard } from './session/home-guard';
import { signedOutGuard } from './session/signed-out-guard';
import { userGuard } from './session/user-guard';

const notFound = {
  loadComponent: () => import('./not-found-page/not-found-page').then((m) => m.NotFoundPage),
  title: 'Not found',
};

// Every page is loaded when it is first opened (its own chunk): the initial bundle stays the shell,
// within the budget of angular.json, however many Material pieces the pages use.
export const routes: Routes = [
  // Signing in (design-accounts.md, "Web: /login"): a page of its own, without the app around it.
  {
    path: 'login',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./login-page/login-page').then((m) => m.LoginPage),
    title: 'Sign in',
    data: { bare: true },
  },
  // The Android app's download (design-android.md, "/download"): public, needed before signing in on
  // the phone; `download` is a reserved word, never a username.
  {
    path: 'download',
    loadComponent: () => import('./download-page/download-page').then((m) => m.DownloadPage),
    title: 'Download the app',
    data: { bare: true },
  },
  // The bare address: one's own pages, or the sign-in page.
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
  // A user's pages live under their username (design-accounts.md, "Web: /<username>/"); another
  // username does not match and lands on the 404 page below, like any address that does not exist.
  {
    path: ':username',
    canMatch: [userGuard],
    children: [
      // The start page: recording a consumption is the most frequent action (design-frontend.md).
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./consumptions-page/consumptions-page').then((m) => m.ConsumptionsPage),
        title: 'Consumptions',
      },
      {
        path: 'substances',
        loadComponent: () => import('./substances-page/substances-page').then((m) => m.SubstancesPage),
        title: 'Substances',
        // The substance page is a child of the substances page, so the list stays rendered underneath
        // it and a direct link or a refresh on .../substances/5 rebuilds the list below (design-frontend.md).
        children: [
          {
            path: ':id',
            loadComponent: () => import('./substance-page/substance-page').then((m) => m.SubstancePage),
            // A batch's page opens over its substance's (design-statistics.md, "batch page").
            children: [
              { path: 'batches/:batchId', loadComponent: () => import('./batch-page/batch-page').then((m) => m.BatchPage) },
            ],
          },
        ],
      },
      {
        path: 'metrics',
        loadComponent: () => import('./metrics-page/metrics-page').then((m) => m.MetricsPage),
        title: 'Metrics',
      },
      {
        path: 'statistics',
        loadComponent: () => import('./statistics-page/statistics-page').then((m) => m.StatisticsPage),
        title: 'Statistics',
      },
      {
        path: 'statistics/edit',
        loadComponent: () => import('./statistics-edit-page/statistics-edit-page').then((m) => m.StatisticsEditPage),
        title: 'What the pages show',
      },
      {
        path: 'settings',
        loadComponent: () => import('./settings-page/settings-page').then((m) => m.SettingsPage),
        title: 'Settings',
      },
      // The admin view (design-accounts.md, "Web: /<username>/admin"): under the administrator's own
      // username, so that `admin` is a username like any other (lenzi, 2026-10-03: the first
      // administrator is "admin" by default). A user, or an impersonation, gets the 404 page below.
      {
        path: 'admin',
        canMatch: [adminGuard],
        loadComponent: () => import('./admin-page/admin-page').then((m) => m.AdminPage),
        title: 'Admin',
      },
      { path: '**', ...notFound },
    ],
  },
  // Anything else: an old address, a typo, another user's page.
  { path: '**', ...notFound },
];
