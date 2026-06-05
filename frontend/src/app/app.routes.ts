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
    path: 'runs/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/runs/run-new.component').then((m) => m.RunNewComponent),
  },
  {
    path: 'runs/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/runs/run-detail.component').then((m) => m.RunDetailComponent),
  },
  {
    path: 'optimizer',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/optimizer/optimizer-list.component').then((m) => m.OptimizerListComponent),
  },
  {
    path: 'optimizer/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/optimizer/optimizer-new.component').then((m) => m.OptimizerNewComponent),
  },
  {
    path: 'optimizer/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/optimizer/optimizer-session.component').then((m) => m.OptimizerSessionComponent),
  },
  {
    path: 'prompt-review',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/prompt-review/prompt-review-list.component').then((m) => m.PromptReviewListComponent),
  },
  {
    path: 'prompt-review/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/prompt-review/prompt-review-new.component').then((m) => m.PromptReviewNewComponent),
  },
  {
    path: 'prompt-review/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/prompt-review/prompt-review-editor.component').then((m) => m.PromptReviewEditorComponent),
  },
  {
    path: 'models',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/models/models.component').then((m) => m.ModelsComponent),
  },
  {
    path: 'models/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/models/model-add.component').then((m) => m.ModelAddComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'runs' },
  { path: '**', redirectTo: 'runs' },
];
