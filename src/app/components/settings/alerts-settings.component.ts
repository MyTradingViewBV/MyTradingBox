
import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-alerts-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './alerts-settings.component.html',
  styleUrls: ['./alerts-settings.component.scss']
})
export class AlertsSettingsComponent {
  constructor(public router: Router) {}

  // Mock alert options
  tradeOrderAlerts = [
    { label: 'New Order', enabled: true },
    { label: 'Target 1 Reached', enabled: false },
    { label: 'Target 2 Reached', enabled: false },
    { label: 'Order Stopped', enabled: true },
  ];
  boxCandleAlerts = [
    { label: 'Candle in Box', enabled: true },
    { label: 'Candle through Box', enabled: false },
  ];
  watchlistAlerts = [
    { label: 'Active Monitoring', enabled: true },
  ];
  capitalFlowTiers = [
    { label: 'Bronze', enabled: true },
    { label: 'Silver', enabled: false },
    { label: 'Gold', enabled: true },
    { label: 'Platinum', enabled: false },
  ];
  capitalFlowTimeframes = [
    { label: '12min', enabled: true },
    { label: '24min', enabled: false },
    { label: '1h', enabled: true },
    { label: '4h', enabled: false },
    { label: '1day', enabled: true },
    { label: '1w', enabled: false },
    { label: '1month', enabled: true },
  ];

  goBack() {
    this.router.navigate(['/settings']);
  }
}
