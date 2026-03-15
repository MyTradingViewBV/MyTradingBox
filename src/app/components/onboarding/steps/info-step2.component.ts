import { Component } from '@angular/core';

@Component({
  selector: 'app-info-step2',
  standalone: true,
  imports: [],
  template: `<section class="step-section">
    <h3>Exchange &amp; Munt kiezen</h3>
    <p><strong>Exchange</strong> &mdash; selecteer boven in het chart-scherm de gewenste beurs (bijv. Bybit). Alle munten en koersen laden automatisch voor die beurs.</p>
    <p><strong>Munt (Symbol)</strong> &mdash; kies een munt via het dropdown-veld naast de exchange. Typ de naam om snel te zoeken. Je keuze wordt automatisch onthouden.</p>
    <ul>
      <li>Alleen munten met actieve box-analyse worden getoond in de lijst</li>
      <li>BTCUSDT, Dominance e.d. zijn altijd beschikbaar</li>
      <li>Exchanges en munten worden nooit verwijderd</li>
    </ul>
    <p class="tip">&#x1F4A1; Tip: je kunt ook vanuit de Watchlist direct naar een munt navigeren.</p>
  </section>`
})
export class InfoStep2Component {}
