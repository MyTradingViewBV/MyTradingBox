import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { debugLog } from 'src/app/helpers/debug-log';

/** Shape of the status object returned by @capacitor/network. */
export interface NetworkStatus {
  connected: boolean;
  connectionType?: string;
}

/**
 * Minimal local description of the @capacitor/network plugin members used
 * here (the package is optional and loaded dynamically).
 */
interface CapacitorNetworkPlugin {
  getStatus(): Promise<NetworkStatus>;
  addListener(
    eventName: 'networkStatusChange',
    listener: (status: NetworkStatus) => void,
  ): unknown;
}

/**
 * Service for managing network connectivity in Capacitor
 * Provides real-time network status for offline-first functionality
 */
@Injectable({
  providedIn: 'root',
})
export class CapacitorOfflineService {
  public isOnline$ = new BehaviorSubject<boolean>(true);
  public isOnline: Observable<boolean> = this.isOnline$.asObservable();
  private Network: CapacitorNetworkPlugin | null = null;

  constructor() {
    this.initNetworkListener();
  }

  /**
   * Initialize network status listener
   * Gets initial status and sets up real-time listener
   */
  private async initNetworkListener(): Promise<void> {
    // Try to load Capacitor Network plugin
    await this.loadCapacitorNetwork();

    // If Capacitor Network is not available, fall back to online API
    if (!this.Network) {
      debugLog('Using window.navigator.onLine for network detection');
      this.isOnline$.next(navigator.onLine);
      window.addEventListener('online', () => {
        this.isOnline$.next(true);
        debugLog('Network came back online');
      });
      window.addEventListener('offline', () => {
        this.isOnline$.next(false);
        console.warn('Network went offline');
      });
      return;
    }

    try {
      // Get current network status
      const status = await this.Network.getStatus();
      this.isOnline$.next(status.connected);
      debugLog(
        'Initial network status:',
        status.connected ? 'online' : 'offline',
      );

      // Listen for network changes
      this.Network.addListener('networkStatusChange', (status) => {
        const wasOnline = this.isOnline$.value;
        const isNowOnline = status.connected;

        this.isOnline$.next(isNowOnline);

        // Log state changes
        if (wasOnline && !isNowOnline) {
          console.warn('Network went offline');
        } else if (!wasOnline && isNowOnline) {
          debugLog('Network came back online');
        }
      });
    } catch (error) {
      console.error('Error initializing network listener:', error);
      // Assume online if error occurs
      this.isOnline$.next(true);
    }
  }

  /**
   * Load Capacitor Network plugin dynamically
   * This avoids compile-time dependency issues
   */
  private async loadCapacitorNetwork(): Promise<void> {
    try {
      // @ts-ignore - Dynamic import to avoid compile-time dependency
      const module = await import('@capacitor/network');
      this.Network = module.Network;
      debugLog('Capacitor Network plugin loaded successfully');
    } catch (error) {
      console.warn(
        'Capacitor Network plugin not available - using browser API',
        error,
      );
      this.Network = null;
    }
  }

  /**
   * Get current network status synchronously
   */
  public getCurrentStatus(): boolean {
    return this.isOnline$.value;
  }

  /**
   * Get network status asynchronously
   */
  public async getStatusAsync(): Promise<NetworkStatus> {
    try {
      if (!this.Network) {
        return { connected: navigator.onLine };
      }
      return await this.Network.getStatus();
    } catch (error) {
      console.error('Error getting network status:', error);
      return { connected: navigator.onLine };
    }
  }

  /**
   * Check if device is currently online
   */
  public isOnlineNow(): boolean {
    return this.isOnline$.value;
  }

  /**
   * Watch for transitions from offline to online
   */
  public watchOnlineTransition(): Observable<boolean> {
    return this.isOnline$;
  }

  /**
   * Perform action when coming back online
   * Useful for syncing data that was queued while offline
   */
  public onComeOnline(callback: () => void | Promise<void>): void {
    let previousStatus = this.isOnline$.value;

    this.isOnline$.subscribe((isOnline) => {
      if (!previousStatus && isOnline) {
        // Transitioned from offline to online
        try {
          const result = callback();
          if (result instanceof Promise) {
            result.catch((err) =>
              console.error('Error in onComeOnline callback:', err),
            );
          }
        } catch (error) {
          console.error('Error in onComeOnline callback:', error);
        }
      }
      previousStatus = isOnline;
    });
  }
}
