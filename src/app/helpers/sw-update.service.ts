import { Injectable, inject } from '@angular/core';
import {
  SwUpdate,
  UnrecoverableStateEvent,
  VersionInstallationFailedEvent,
  VersionReadyEvent,
} from '@angular/service-worker';
import { TranslateService } from '@ngx-translate/core';
import { interval, switchMap } from 'rxjs';
import { NotificationService } from './notification.service';
import { ToastService } from './toast.service';
import { debugLog } from 'src/app/helpers/debug-log';

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
  private toast = inject(ToastService);
  private translate = inject(TranslateService);

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
      .pipe(switchMap(() => this.swUpdate.checkForUpdate()))
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
        this.handleInstallationFailed(event);
      }
    });

    // The cached version is broken (files gone from the server): only a reload helps.
    this.swUpdate.unrecoverable.subscribe((event) => this.handleUnrecoverable(event));
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
    this.notificationService
      .requestAndShow('App Update Available', {
        body: 'A new version of the app is available. Tap to update.',
        tag: 'app-update',
      })
      .catch((err) => console.error('Failed to show update notification', err));

    debugLog('App update available - user notified');
  }

  /**
   * Handle when update is ready — activate and reload
   */
  private handleUpdateActivated(event: VersionReadyEvent): void {
    debugLog('New version ready:', event);
    this.swUpdate.activateUpdate().then(() => {
      document.location.reload();
    });
  }

  /**
   * A new version failed to install. The app keeps running the current version, so there is nothing
   * for the user to do: log it only (this used to raise an "App Error" system notification).
   */
  private handleInstallationFailed(event: VersionInstallationFailedEvent): void {
    console.warn('[SW] New version failed to install; staying on the current version:', event.error);
  }

  /** The running version cannot continue: ask in the app to reload (no system notification). */
  private handleUnrecoverable(event: UnrecoverableStateEvent): void {
    console.error('[SW] Unrecoverable state:', event.reason);
    this.toast.show(this.translate.instant('APP_UPDATE.BROKEN'), 'warning', 0, {
      label: this.translate.instant('APP_UPDATE.RELOAD'),
      run: () => document.location.reload(),
    });
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
      .catch((err: unknown) => {
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
