import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-info-step2',
  standalone: true,
  imports: [CommonModule],
  template: `<section class="step-section">
    <h3>Stap 2: Chart Navigatie</h3>
    <p>Gebruik het symboolveld om snel een markt te kiezen. Je laatste selectie wordt opgeslagen.</p>
    <p><code>CTRL + /</code> opent snelle zoekfuncties (indien ingeschakeld).</p>
  </section>`
})
export class InfoStep2Component {}
