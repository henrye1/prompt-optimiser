import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly busy = signal(false);

  async submit(): Promise<void> {
    this.error.set(null);
    this.info.set(null);
    this.busy.set(true);
    try {
      await this.auth.signUp(this.email, this.password);
      // With email confirmation enabled, a session may not exist yet.
      if (this.auth.isAuthenticated()) {
        await this.router.navigateByUrl('/');
      } else {
        this.info.set('Account created. Check your email to confirm, then sign in.');
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      this.busy.set(false);
    }
  }
}
