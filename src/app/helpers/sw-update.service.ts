import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { interval, filter, switchMap } from 'rxjs';
import { NotificationService } from './notification.service';

/**
 * Service for managing Service Worker updates
 * Checks for updates periodically and notifies user when available
 */
@Injectable({
  providedIn: 'root',
})
export class SwUpdateService {
  private swUpdate = inject(SwUpdate);
  private notificationService = inject(NotificationService);

  constructor() {
    this.initializeUpdateCheck();
  }

  /**
   * Initialize periodic update checking
   * Checks every 6 hours for available updates
   */
  private initializeUpdateCheck(): void {
    if (!this.swUpdate.isEnabled) {
      console.warn('Service Worker updates are disabled');
      return;
    }

    // Check for updates immediately on initialization
    this.checkForUpdatesNow();

    // Check for updates every 6 hours
    interval(6 * 60 * 60 * 1000)
      .pipe(
        switchMap(() => this.swUpdate.checkForUpdate()),
      )
      .subscribe({
        next: (updateAvailable) => {
          if (updateAvailable) {
            this.handleUpdateAvailable();
          }
        },
        error: (err) => console.error('SW update check error:', err),
      });

    // Listen for successful activation
    this.swUpdate.activated.subscribe((event) => {
      this.handleUpdateActivated(event);
    });

    // Listen for failed updates
    this.swUpdate.unrecoverable.subscribe((event) => {
      this.handleUnrecoverableError(event);
    });
  }

  /**
   * Check for updates immediately
   */
  public checkForUpdatesNow(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate
      .checkForUpdate()
      .then((updateAvailable) => {
        if (updateAvailable) {
          this.handleUpdateAvailable();
        }
      })
      .catch((err) => {
        console.error('Error checking for updates:', err);
      });
  }

  /**
   * Handle when an update is available
   */
  private handleUpdateAvailable(): void {
    this.notificationService.showNotification(
      'App Update Available',
      'A new version of the app is available. Tap to update.',
      {
        action: 'update',
        actionHandler: () => this.forceUpdate(),
      }
    );

    console.log('App update available - user notified');
  }

  /**
   * Handle when update is activated
   */
  private handleUpdateActivated(event: any): void {
    this.notificationService.showNotification(
      'App Updated',
      'The app has been updated successfully. Refresh to see changes.',
      {
        action: 'refresh',
        actionHandler: () => window.location.reload(),
      }
    );

    console.log('Update activated:', event);
  }

  /**
   * Handle unrecoverable SW errors
   */
  private handleUnrecoverableError(event: any): void {
    console.error('Unrecoverable Service Worker error:', event);
    this.notificationService.showNotification(
      'App Error',
      'An error occurred. The app will need to be refreshed.'
    );
  }

  /**
   * Force update by activating and reloading
   */
  public forceUpdate(): void {
    this.swUpdate
      .activateUpdate()
      .then(() => {
        window.location.reload();
      })
      .catch((err) => {
        console.error('Error activating update:', err);
      });
  }

  /**
   * Unsubscribe from Service Worker events (cleanup)
   */
  public ngOnDestroy(): void {
    // Subscription cleanup if needed
  }
}
