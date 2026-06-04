import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'prompt-sets',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/promptsets/prompt-set-list.component').then((m) => m.PromptSetListComponent),
  },
  {
    path: 'prompt-sets/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/promptsets/prompt-set-editor.component').then((m) => m.PromptSetEditorComponent),
  },
  {
    path: 'runs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/runs/run-list.component').then((m) => m.RunListComponent),
  },
  {
    path: 'runs/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/runs/run-detail.component').then((m) => m.RunDetailComponent),
  },
  {
    path: 'models',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/models/models.component').then((m) => m.ModelsComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  { path: '**', redirectTo: '' },
];
