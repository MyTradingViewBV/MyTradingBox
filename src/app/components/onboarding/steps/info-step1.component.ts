import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-info-step1',
  standalone: true,
  imports: [CommonModule],
  template: `<section class="step-section">
    <h3>Stap 1: Overzicht</h3>
    <p>Welkom! Deze korte rondleiding laat je de belangrijkste onderdelen van het platform zien.</p>
    <ul>
      <li>Realtime charts</li>
      <li>Watchlist & orders</li>
      <li>Snelle thema wissel</li>
    </ul>
  </section>`
})
export class InfoStep1Component {}
