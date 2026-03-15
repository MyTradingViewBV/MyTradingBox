import { Component } from '@angular/core';

@Component({
  selector: 'app-info-step3',
  standalone: true,
  imports: [],
  template: `<section class="step-section">
    <h3>Chart &amp; Tijdsframe</h3>
    <p>De chart toont live candlesticks voor de geselecteerde munt en tijdsframe.</p>
    <p><strong>Tijdsframe wisselen</strong> &mdash; gebruik de knoppen boven de chart:</p>
    <ul>
      <li><strong>12m / 24m</strong> &ndash; zeer korte termijn</li>
      <li><strong>1H</strong> &ndash; uur chart &mdash; standaard voor signalen</li>
      <li><strong>4H</strong> &ndash; middellange termijn</li>
      <li><strong>1D / 1W / 1M</strong> &ndash; dagelijks, wekelijks, maandelijks</li>
    </ul>
    <p><strong>Navigeren op de chart</strong></p>
    <ul>
      <li>Pinch of scroll om in- en uit te zoomen</li>
      <li>Sleep om te pannen (links / rechts)</li>
      <li>Dubbeltik om terug te keren naar de huidige candle</li>
    </ul>
  </section>`
})
export class InfoStep3Component {}
