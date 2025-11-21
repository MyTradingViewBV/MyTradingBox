import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { UpdateService } from '../../helpers/update.service';
import { ChartLayoutService } from '../chart/services/chart-layout.service';

@Component({
  selector: 'app-footer',
  // Angular Material removed; using plain HTML elements now
  imports: [],
  templateUrl: './footer-compenent.html',
  styleUrl: './footer-compenent.scss',
})
export class FooterComponent {
  constructor(
    private _router: Router,
    private _updateService: UpdateService,
    private _layout: ChartLayoutService,
  ) {}
  // Accessor for template to reflect current mode
  get compactMode(): boolean { return this._layout.compactMode; }

  // Toggle chart compact mode via shared layout service
  toggleChartCompact(): void { this._layout.toggleCompact(); }

  async showNotification(): Promise<void> {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('Hello from myTradingBox!', {
          body: 'This is a test push notification 🚀',
          icon: 'assets/icons/icon-192x192.png',
        });
      } else {
        console.warn('Notifications permission not granted:', permission);
      }
    } else {
      console.warn('This browser does not support notifications.');
    }
  }

  navigate(route: string): void {
    console.log('navigating to', route);
    this._router.navigate([`/${route}`]);
  }

  checkForUpdates(): void {
    this._updateService.checkForUpdate();
  }
}
