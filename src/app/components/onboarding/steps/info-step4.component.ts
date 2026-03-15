import { Component } from '@angular/core';

@Component({
  selector: 'app-info-step4',
  standalone: true,
  imports: [],
  template: `<section class="step-section">
    <h3>Chart Instellingen</h3>
    <p>Het tandwiel-icoon (&#x2699;) rechtsboven in de chart opent de instellingen. Zet lagen aan of uit:</p>
    <ul>
      <li><strong>Boxes</strong> &ndash; support &amp; resistance zones (standaard aan)</li>
      <li><strong>Key Zones</strong> &ndash; kritieke prijsniveaus op basis van historische data</li>
      <li><strong>Indicatoren</strong> &ndash; EMA&apos;s, golden/silver signalen en divergenties</li>
      <li><strong>Market Cipher</strong> &ndash; extra momentum-indicatoren</li>
      <li><strong>Orders</strong> &ndash; toon openstaande orders als lijnen op de chart</li>
    </ul>
    <p><strong>Tekenhulpmiddelen</strong> &mdash; linksonder op de chart staan knoppen om lijnen, rechthoeken en labels te tekenen. Gebruik de gum om ze te wissen.</p>
    <p class="tip">&#x1F4A1; Instellingen worden per sessie bewaard.</p>
  </section>`
})
export class InfoStep4Component {}
