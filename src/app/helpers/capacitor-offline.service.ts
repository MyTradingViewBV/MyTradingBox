import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject, Observable } from 'rxjs';

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

  constructor() {
    this.initNetworkListener();
  }

  /**
   * Initialize network status listener
   * Gets initial status and sets up real-time listener
   */
  private async initNetworkListener(): Promise<void> {
    try {
      // Get current network status
      const status = await Network.getStatus();
      this.isOnline$.next(status.connected);
      console.log('Initial network status:', status.connected ? 'online' : 'offline');

      // Listen for network changes
      Network.addListener('networkStatusChange', (status) => {
        const wasOnline = this.isOnline$.value;
        const isNowOnline = status.connected;

        this.isOnline$.next(isNowOnline);

        // Log state changes
        if (wasOnline && !isNowOnline) {
          console.warn('Network went offline');
        } else if (!wasOnline && isNowOnline) {
          console.log('Network came back online');
        }
      });
    } catch (error) {
      console.error('Error initializing network listener:', error);
      // Assume online if error occurs
      this.isOnline$.next(true);
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
  public async getStatusAsync(): Promise<any> {
    try {
      return await Network.getStatus();
    } catch (error) {
      console.error('Error getting network status:', error);
      return { connected: true };
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
              console.error('Error in onComeOnline callback:', err)
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
