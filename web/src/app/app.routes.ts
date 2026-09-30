import { Routes } from '@angular/router';

// Every page is loaded when it is first opened (its own chunk): the initial bundle stays the shell,
// within the budget of angular.json, however many Material pieces the pages use.
export const routes: Routes = [
  // The start page: recording a consumption is the most frequent action (design-frontend.md).
  { path: '', pathMatch: 'full', redirectTo: 'consumptions' },
  {
    path: 'consumptions',
    loadComponent: () => import('./consumptions-page/consumptions-page').then((m) => m.ConsumptionsPage),
    title: 'Consumptions',
  },
  {
    path: 'substances',
    loadComponent: () => import('./substances-page/substances-page').then((m) => m.SubstancesPage),
    title: 'Substances',
    // The substance page is a child of the substances page, so the list stays rendered underneath
    // it and a direct link or a refresh on /substances/5 rebuilds the list below (design-frontend.md).
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
    path: 'statistics/edit',
    loadComponent: () => import('./statistics-edit-page/statistics-edit-page').then((m) => m.StatisticsEditPage),
    title: 'What the pages show',
  },
  // An unknown URL (an old bookmark, a typo) lands on the start page.
  { path: '**', redirectTo: 'consumptions' },
];
