import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-info-step5',
  standalone: true,
  imports: [CommonModule],
  template: `<section class="step-section">
    <h3>Stap 5: Klaar!</h3>
    <p>Je bent klaar om te starten met traden. Deze rondleiding verschijnt niet meer na afronden.</p>
    <p>Veel succes en een scherp oog op de markt!</p>
  </section>`
})
export class InfoStep5Component {}
