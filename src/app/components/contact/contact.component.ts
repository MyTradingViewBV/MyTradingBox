import { Component } from '@angular/core';

import { Router } from '@angular/router';
import { Location } from '@angular/common';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
})
export class ContactComponent {
  constructor(private router: Router, private location: Location) {}

  back(): void {
    this.location.back();
  }
}
