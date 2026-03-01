import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-footer',
  // Angular Material removed; using plain HTML elements now
  imports: [],
  templateUrl: './footer-compenent.html',
  styleUrl: './footer-compenent.scss',
})
export class FooterComponent {
  private readonly _router = inject(Router);

  constructor() {}

  navigate(route: string): void {
    console.log('navigating to', route);
    this._router.navigate([`/${route}`]);
  }
}
