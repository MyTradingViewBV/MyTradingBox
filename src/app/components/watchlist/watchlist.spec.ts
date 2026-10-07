import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WatchlistComponent } from './watchlist';
import { ExchangeTickerFactoryService } from './services/exchange-ticker-factory.service';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import {
  installMatchMediaStub,
  provideComponentTestEnvironment,
} from 'src/testing/test-providers';

describe('WatchlistComponent', () => {
  let fixture: ComponentFixture<WatchlistComponent>;
  let component: WatchlistComponent;
  let ticker: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    getLatest: () => Map<string, unknown>;
    key: (exchangeId: number, symbol: string) => string;
  };
  const btc = Object.assign(new SymbolModel(), {
    Id: 1,
    SymbolName: 'BTCUSDT',
  });

  beforeEach(async () => {
    installMatchMediaStub();
    // symbolsCache is static; reset it so each test starts cold.
    (
      WatchlistComponent as unknown as { symbolsCache: SymbolModel[] | null }
    ).symbolsCache = null;

    ticker = {
      connect: vi.fn().mockReturnValue(NEVER),
      disconnect: vi.fn(),
      getLatest: () => new Map(),
      key: (exchangeId, symbol) => `${exchangeId}:${symbol}`,
    };

    await TestBed.configureTestingModule({
      imports: [WatchlistComponent],
      providers: [
        provideComponentTestEnvironment(),
        {
          provide: ChartService,
          useValue: {
            getExchanges: vi.fn().mockReturnValue(of([])),
            getSymbols: vi.fn().mockReturnValue(of([btc])),
          },
        },
        { provide: ExchangeTickerFactoryService, useValue: ticker },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates and finishes loading with an empty watchlist when there are no exchanges', () => {
    expect(component).toBeTruthy();
    expect(component.loading).toBe(false);
    expect(component.userSymbols).toEqual([]);
    expect(ticker.connect).toHaveBeenCalledWith([]);
  });

  it('selects the symbol and timeframe in the store before navigating to the chart', () => {
    const settings = TestBed.inject(SettingsService);
    const dispatch = vi.spyOn(settings, 'dispatchAppAction');
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);

    component.goToChart('BTCUSDT', ' ');

    expect(dispatch).toHaveBeenCalledWith(
      SettingsActions.setSelectedSymbol({ symbol: btc }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      SettingsActions.setSelectedTimeframe({ timeframe: '1d' }),
    );
    expect(navigate).toHaveBeenCalledWith(['/mcb-chart', 'BTCUSDT', '1d']);
  });

  it('builds signal chip classes from the signal direction and tier', () => {
    expect(component.signalChipClass(undefined)).toBe(
      'tv-signal-chip inactive',
    );
    expect(component.signalChipClass('Gold Bullish')).toBe(
      'tv-signal-chip tier-gold dir-bull',
    );
    expect(component.signalChipClass('diamond_bearish')).toBe(
      'tv-signal-chip tier-diamond dir-bear',
    );
  });

  it('stops the live refresh timer and disconnects the ticker on destroy', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    fixture.destroy();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(ticker.disconnect).toHaveBeenCalledTimes(1);
  });
});
