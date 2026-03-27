import { Component, inject } from '@angular/core';

import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { FooterComponent } from '../footer/footer-compenent';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [TranslateModule, BackButtonComponent, RouterModule, FooterComponent],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
})
export class ContactComponent {
  private readonly router = inject(Router);

  constructor() {}
}
