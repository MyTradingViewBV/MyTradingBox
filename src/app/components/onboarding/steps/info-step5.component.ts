import { Component } from '@angular/core';

@Component({
  selector: 'app-info-step5',
  standalone: true,
  imports: [],
  template: `<section class="step-section">
    <h3>Watchlist</h3>
    <p>De <strong>Watchlist</strong> is jouw persoonlijk overzicht van munten die je wilt volgen. Open hem via het menu onderaan.</p>
    <p>Per munt zie je in &eacute;&eacute;n oogopslag:</p>
    <ul>
      <li>Huidige prijs &amp; procentuele verandering (live)</li>
      <li>Candle richting voor <strong>1H</strong>, <strong>4H</strong> en <strong>1D</strong> &mdash; groen (&#x25B2;), rood (&#x25BC;) of neutraal</li>
    </ul>
    <p><strong>Naar de chart</strong> &mdash; tik op een munt of op een candle-indicator om direct naar die tijdsframe-chart te navigeren.</p>
    <p class="tip">&#x1F4A1; BTCUSDT en Dominance staan altijd bovenaan en zijn niet verwijderbaar.</p>
  </section>`
})
export class InfoStep5Component {}
