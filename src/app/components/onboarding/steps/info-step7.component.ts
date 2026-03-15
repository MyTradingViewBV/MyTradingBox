import { Component } from '@angular/core';

@Component({
  selector: 'app-info-step7',
  standalone: true,
  imports: [],
  template: `<section class="step-section">
    <h3>Je bent klaar! &#x1F680;</h3>
    <p>Je kent nu alle basisonderdelen van MyTradingBox. Een kort overzicht:</p>
    <ul>
      <li>&#x1F3E6; <strong>Exchange &amp; Munt</strong> &mdash; kies bovenaan de chart</li>
      <li>&#x23F1; <strong>Tijdsframe</strong> &mdash; 12m &rarr; 1H &rarr; 4H &rarr; 1D &rarr; &hellip;</li>
      <li>&#x2699; <strong>Chart instellingen</strong> &mdash; lagen aan/uitzetten via het tandwiel</li>
      <li>&#x2B50; <strong>Watchlist</strong> &mdash; volg munten, candle-richtingen in &eacute;&eacute;n oogopslag</li>
      <li>&#x1F50D; <strong>Coin info</strong> &mdash; tik op een munt voor details &amp; watchlist-beheer</li>
    </ul>
    <p>Push-notificaties voor gold &amp; silver signalen brengen je automatisch naar de juiste chart zodra je op de melding tikt &mdash; mits je ingelogd bent.</p>
    <p style="margin-top:1rem;font-size:1rem;color:#f0b90b;font-weight:600">Veel succes en een scherp oog op de markt! &#x1F4AA;</p>
  </section>`
})
export class InfoStep7Component {}
