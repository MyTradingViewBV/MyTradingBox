/**
 * Binance WebSocket kline (candlestick) streaming service
 *
 * Responsibilities:
 * - Manage one active websocket connection at a time
 * - Parse incoming Binance kline events
 * - Normalize to app-level LiveKlineUpdate model
 * - Handle reconnection with exponential backoff
 * - Clean lifecycle management
 *
 * Does NOT break existing chart history loading:
 * - Historical data still flows through REST API (marketService.getCandles)
 * - WebSocket is purely for live edge updates
 * - Component must merge live updates with history separately
 */

import { Injectable, inject, DestroyRef } from '@angular/core';
import {
  Subject,
  Observable,
  timer,
  of,
  throwError,
  EMPTY,
  fromEvent,
} from 'rxjs';
import {
  map,
  filter,
  switchMap,
  catchError,
  retry,
  takeUntil,
  take,
  delayWhen,
} from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BinanceKlineEvent,
  LiveKlineUpdate,
} from 'src/app/modules/shared/models/chart/binance-kline.dto';
import {
  mapTimeframeToBinanceInterval,
  isValidBinanceInterval,
} from '../utils/merge-live-candles';

@Injectable({ providedIn: 'root' })
export class BinanceStreamService {
  private destroy$ = inject(DestroyRef);
  private websocket: WebSocket | null = null;

  // Subject to emit parsed kline updates
  private klineUpdates$ = new Subject<LiveKlineUpdate>();

  // Subject to signal disconnection (for reconnect logic)
  private disconnected$ = new Subject<void>();

  // Reconnection retry settings
  private readonly MAX_RETRIES = 5;
  private readonly BASE_BACKOFF_MS = 1000;
  private retryCount = 0;

  // Current connection state
  private currentSymbol: string | null = null;
  private currentInterval: string | null = null;

  constructor() {
    // Cleanup on service destroy
    fromEvent(document, 'beforeunload')
      .pipe(takeUntilDestroyed(this.destroy$))
      .subscribe(() => {
        this.disconnect();
      });
  }

  /**
   * Connect to Binance kline stream for a given symbol and interval
   * Returns an Observable that emits LiveKlineUpdate events
   *
   * If a previous connection exists, it will be closed before opening the new one
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param interval - Kline interval (e.g., "1m", "1h", "1d")
   * @returns Observable<LiveKlineUpdate> - Emits on each kline update
   */
  connectKlineStream(symbol: string, interval: string): Observable<LiveKlineUpdate> {
    symbol = (symbol || '').toUpperCase().trim();
    interval = (interval || '').toLowerCase().trim();

    // Validate inputs
    if (!symbol || !isValidBinanceInterval(interval)) {
      console.warn(
        `[BinanceStreamService] Invalid symbol or interval: ${symbol} / ${interval}`,
      );
      return EMPTY;
    }

    // Check if already connected to the same stream
    if (this.currentSymbol === symbol && this.currentInterval === interval) {
      return this.klineUpdates$.asObservable();
    }

    // Disconnect previous stream if any
    this.disconnect();

    // Store current connection params
    this.currentSymbol = symbol;
    this.currentInterval = interval;
    this.retryCount = 0;

    // Attempt to open websocket with retry logic
    this.attemptConnect(symbol, interval);

    // Return the observable that will emit all incoming klines
    return this.klineUpdates$.asObservable();
  }

  /**
   * Disconnect the current websocket
   * Safe to call even if already disconnected
   */
  disconnect(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.currentSymbol = null;
    this.currentInterval = null;
    this.retryCount = 0;
    this.disconnected$.next();
  }

  /**
   * Attempt to open and connect to Binance websocket
   * Implements exponential backoff retry logic
   */
  private attemptConnect(symbol: string, interval: string): void {
    // Check if we've exceeded max retries
    if (this.retryCount >= this.MAX_RETRIES) {
      console.error(
        `[BinanceStreamService] Max retries (${this.MAX_RETRIES}) exceeded for ${symbol}@${interval}`,
      );
      return;
    }

    try {
      const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
      const wsUrl = `wss://stream.binance.com:9443/ws/${streamName}`;

      console.log(
        `[BinanceStreamService] Connecting to Binance stream: ${wsUrl}`,
      );

      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        console.log(
          `[BinanceStreamService] Connected to ${streamName}`,
        );
        this.retryCount = 0; // Reset retries on successful connection
      };

      this.websocket.onmessage = (event: MessageEvent) => {
        console.log('[BinanceStreamService] onmessage fired, processing event...');
        this.handleKlineMessage(event.data);
      };

      this.websocket.onerror = (error: Event) => {
        console.error(
          `[BinanceStreamService] WebSocket error:`,
          error,
        );
      };

      this.websocket.onclose = () => {
        console.warn(
          `[BinanceStreamService] WebSocket closed for ${streamName}, will reconnect`,
        );
        this.websocket = null;
        this.scheduleReconnect(symbol, interval);
      };
    } catch (error) {
      console.error(
        `[BinanceStreamService] Failed to create WebSocket:`,
        error,
      );
      this.scheduleReconnect(symbol, interval);
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(symbol: string, interval: string): void {
    if (this.currentSymbol !== symbol || this.currentInterval !== interval) {
      // Connection params have changed, don't reconnect
      return;
    }

    const backoffMs = this.BASE_BACKOFF_MS * Math.pow(2, this.retryCount);
    this.retryCount++;

    console.warn(
      `[BinanceStreamService] Will reconnect in ${backoffMs}ms (attempt ${this.retryCount}/${this.MAX_RETRIES})`,
    );

    timer(backoffMs)
      .pipe(
        takeUntil(this.disconnected$),
        takeUntilDestroyed(this.destroy$),
      )
      .subscribe(() => {
        this.attemptConnect(symbol, interval);
      });
  }

  /**
   * Parse and normalize incoming Binance kline message
   */
  private handleKlineMessage(messageData: string): void {
      console.log("BINANCE MESSAGE RECEIVED", messageData.substring(0, 80));
    try {
      const event: BinanceKlineEvent = JSON.parse(messageData);

      if (event.e !== 'kline') {
        // Not a kline event, ignore
        console.log('[BinanceStreamService] Not a kline event, ignoring');
        return;
      }

      const k = event.k;
      if (!k) {
        console.log('[BinanceStreamService] No kline data in event');
        return;
      }

      // Normalize Binance kline to app-level model
      const update: LiveKlineUpdate = {
        symbol: k.s,
        interval: k.i,
        openTime: k.t,
        closeTime: k.T,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isClosed: k.x, // true if kline is finalized
      };

      console.log('[BinanceStreamService] Emitting update:', update.symbol, update.close);
      // Emit the normalized update
      this.klineUpdates$.next(update);
    } catch (error) {
      console.error(
        `[BinanceStreamService] Failed to parse kline message:`,
        error,
      );
    }
  }

  /**
   * Get the current connection status
   */
  isConnected(): boolean {
    return this.websocket !== null && this.websocket.readyState === WebSocket.OPEN;
  }

  /**
   * Get current symbol and interval
   */
  getCurrentStream(): { symbol: string | null; interval: string | null } {
    return {
      symbol: this.currentSymbol,
      interval: this.currentInterval,
    };
  }
}
