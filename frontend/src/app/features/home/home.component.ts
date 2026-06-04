import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

/** Authenticated landing page: greeting + quick links into the main areas. */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly email = this.auth.user()?.email ?? '';
  readonly backendOk = signal(false);

  constructor() {
    this.http.get<{ userId: string }>(`${environment.apiBaseUrl}/api/me`).subscribe({
      next: () => this.backendOk.set(true),
      error: () => this.backendOk.set(false),
    });
  }
}
