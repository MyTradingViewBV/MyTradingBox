import { Component, inject } from '@angular/core';

import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
})
export class ContactComponent {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  constructor() {}

  back(): void {
    this.location.back();
  }
}
