import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-info-step3',
  standalone: true,
  imports: [CommonModule],
  template: `<section class="step-section">
    <h3>Stap 3: Orders Plaatsen</h3>
    <p>Plaats een order vanuit het orders-paneel of direct vanaf de chart wanneer interacties geactiveerd zijn.</p>
    <ul>
      <li>Snelle koop/verkoop knoppen</li>
      <li>Live balans update</li>
    </ul>
  </section>`
})
export class InfoStep3Component {}
