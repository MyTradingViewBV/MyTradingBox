import { Component } from '@angular/core';

@Component({
  selector: 'app-info-step1',
  standalone: true,
  imports: [],
  template: `<section class="step-section">
    <h3>Welkom bij MyTradingBox</h3>
    <p>Deze korte rondleiding legt de belangrijkste functies uit zodat je direct aan de slag kunt.</p>
    <ul>
      <li>&#x1F4C8; <strong>Chart</strong> &ndash; live candlestick grafiek met key zones &amp; indicatoren</li>
      <li>&#x23F1; <strong>Tijdsframe</strong> &ndash; wissel eenvoudig tussen 12m, 1H, 4H, 1D en meer</li>
      <li>&#x1F3E6; <strong>Exchange</strong> &ndash; kies op welke beurs je handelt</li>
      <li>&#x1F50D; <strong>Coin info</strong> &ndash; bekijk details &amp; voeg een munt toe aan je watchlist</li>
      <li>&#x2B50; <strong>Watchlist</strong> &ndash; volg je favoriete munten in &eacute;&eacute;n oogopslag</li>
    </ul>
    <p class="tip">Gebruik de pijlen onderaan om stap voor stap door de rondleiding te lopen, of sluit af met &times;.</p>
  </section>`
})
export class InfoStep1Component {}
