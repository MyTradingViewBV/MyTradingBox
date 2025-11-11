import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { UpdateService } from '../../helpers/update.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-footer',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './footer-compenent.html',
  styleUrl: './footer-compenent.scss',
})
export class FooterComponent {
  constructor(
    private _router: Router,
    private _updateService: UpdateService,
  ) {}

  async showNotification(): Promise<void> {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('Hello from Box2Box!', {
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
