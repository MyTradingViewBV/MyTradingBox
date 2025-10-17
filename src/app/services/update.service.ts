import { Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  constructor(private swUpdate: SwUpdate) {}

  checkForUpdate(): void {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.checkForUpdate().then((hasUpdate) => {
        if (hasUpdate) {
          // force reload to apply update
          document.location.reload();
        } else {
          alert('✅ You are already on the latest version!');
        }
      });
    } else {
      console.warn('Service worker updates are not enabled.');
    }
  }
}
