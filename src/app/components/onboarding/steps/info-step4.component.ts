import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-info-step4',
  standalone: true,
  imports: [CommonModule],
  template: `<section class="step-section">
    <h3>Stap 4: Thema & Instellingen</h3>
    <p>Schakel tussen licht en donker thema voor optimale zichtbaarheid. Instellingen worden onthouden.</p>
    <p>Experimentele features kun je hier activeren.</p>
  </section>`
})
export class InfoStep4Component {}
