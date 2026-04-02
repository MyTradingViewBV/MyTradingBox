import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppService } from 'src/app/modules/shared/services/services/appService';

@Component({
  selector: 'app-footer',
  standalone: true,
  // Angular Material removed; using plain HTML elements now
  imports: [TranslateModule],
  templateUrl: './footer-compenent.html',
  styleUrl: './footer-compenent.scss',
})
export class FooterComponent {
  private readonly _router = inject(Router);
  readonly isAdmin = toSignal(inject(AppService).isAdmin(), { initialValue: false });

  constructor() {}

  navigate(route: string): void {
    console.log('navigating to', route);
    this._router.navigate([`/${route}`]);
  }
}
