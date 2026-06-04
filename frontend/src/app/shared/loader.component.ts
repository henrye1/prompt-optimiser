import { Component, input } from '@angular/core';

/** Centered page loading indicator (spinner + label). */
@Component({
  selector: 'app-loader',
  template: `
    <div class="page-loader">
      <span class="spinner lg"></span>
      @if (label()) {
        <span class="pl-label">{{ label() }}</span>
      }
    </div>
  `,
})
export class LoaderComponent {
  readonly label = input('Loading…');
}
