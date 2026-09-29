import { Routes } from '@angular/router';

import { ConsumptionsPage } from './consumptions-page/consumptions-page';
import { SubstancePage } from './substance-page/substance-page';
import { SubstancesPage } from './substances-page/substances-page';

export const routes: Routes = [
  // The start page: recording a consumption is the most frequent action (design-frontend.md).
  { path: '', pathMatch: 'full', redirectTo: 'consumptions' },
  { path: 'consumptions', component: ConsumptionsPage, title: 'Consumptions' },
  {
    path: 'substances',
    component: SubstancesPage,
    title: 'Substances',
    // The substance page is a child of the substances page, so the list stays rendered underneath
    // it and a direct link or a refresh on /substances/5 rebuilds the list below (design-frontend.md).
    children: [{ path: ':id', component: SubstancePage }],
  },
  // An unknown URL (an old bookmark, a typo) lands on the start page.
  { path: '**', redirectTo: 'consumptions' },
];
