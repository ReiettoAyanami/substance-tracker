import { Routes } from '@angular/router';

import { Home } from './home/home';
import { SubstancePage } from './substance-page/substance-page';

export const routes: Routes = [
  {
    path: '',
    component: Home,
    title: 'Substances',
    // The substance page is a child of the home, so the home stays rendered underneath it and a
    // direct link or a refresh on /substances/5 rebuilds the home below (design-frontend.md).
    children: [{ path: 'substances/:id', component: SubstancePage }],
  },
];
