import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  async submit(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.signIn(this.email, this.password);
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      this.busy.set(false);
    }
  }
}
