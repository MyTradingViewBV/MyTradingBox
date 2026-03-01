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

    // Listen for version updates
    this.swUpdate.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.handleUpdateActivated(event);
      } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
        this.handleUnrecoverableError(event);
      }
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
    this.notificationService.requestAndShow(
      'App Update Available',
      {
        body: 'A new version of the app is available. Tap to update.',
        tag: 'app-update',
      }
    ).catch((err) => console.error('Failed to show update notification', err));

    console.log('App update available - user notified');
  }

  /**
   * Handle when update is activated
   */
  private handleUpdateActivated(event: any): void {
    this.notificationService.requestAndShow(
      'App Updated',
      {
        body: 'The app has been updated successfully. Refresh to see changes.',
        tag: 'app-updated',
      }
    ).catch((err) => console.error('Failed to show update notification', err));

    console.log('Update activated:', event);
  }

  /**
   * Handle unrecoverable SW errors
   */
  private handleUnrecoverableError(event: any): void {
    console.error('Unrecoverable Service Worker error:', event);
    this.notificationService.requestAndShow(
      'App Error',
      {
        body: 'An error occurred. The app will need to be refreshed.',
        tag: 'app-error',
      }
    ).catch((err: any) => console.error('Failed to show error notification', err));
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
      .catch((err: any) => {
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
