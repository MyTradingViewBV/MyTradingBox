import { Component } from '@angular/core';

@Component({
  selector: 'app-info-step6',
  standalone: true,
  imports: [],
  template: `<section class="step-section">
    <h3>Coin Info &amp; Watchlist beheer</h3>
    <p><strong>Coin info</strong> &mdash; tik op de muntnaam in de Watchlist om de detailpagina te openen. Je ziet er:</p>
    <ul>
      <li>Exchange, symbol en actuele prijs</li>
      <li>Candle richtingen per tijdsframe</li>
      <li>Openstaande boxes en key zones</li>
    </ul>
    <p><strong>Toevoegen aan Watchlist</strong> &mdash; ga naar <em>Watchlist &rarr; + Toevoegen</em>, zoek een munt en bevestig. De munt verschijnt direct in je overzicht.</p>
    <p><strong>Verwijderen uit Watchlist</strong> &mdash; veeg de rij naar links of gebruik de verwijder-knop op de detailpagina van de munt.</p>
    <p class="tip">&#x1F4A1; Vaste munten (BTC, Dominance) kunnen niet worden verwijderd.</p>
  </section>`
})
export class InfoStep6Component {}
