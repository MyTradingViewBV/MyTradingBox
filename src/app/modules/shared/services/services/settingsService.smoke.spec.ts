import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { vi } from 'vitest';
import { SettingsService } from './settingsService';
import { Exchange } from '../../models/orders/exchange.dto';

describe('SettingsService selected exchange persistence', () => {
  const storageKey = SettingsService.selectedExchangeStorageKey;
  let dispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    dispatch = vi.fn();

    TestBed.configureTestingModule({
      providers: [{ provide: Store, useValue: { dispatch, select: vi.fn() } }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hydrates a valid stored exchange before consumers read the store', () => {
    localStorage.setItem(storageKey, JSON.stringify({ Id: 2, Name: 'Kraken' }));

    TestBed.runInInjectionContext(() => new SettingsService());

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: expect.objectContaining({ Id: 2, Name: 'Kraken' }),
      }),
    );
  });

  it('persists a selected exchange and dispatches it to the store', () => {
    const service = TestBed.runInInjectionContext(() => new SettingsService());
    const exchange = new Exchange();
    exchange.Id = 3;
    exchange.Name = 'Coinbase';

    service.setSelectedExchange(exchange);

    expect(JSON.parse(localStorage.getItem(storageKey) || '{}')).toEqual({
      Id: 3,
      Name: 'Coinbase',
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ exchange }),
    );
  });

  it('removes a malformed stored exchange preference', () => {
    localStorage.setItem(storageKey, '{invalid');

    TestBed.runInInjectionContext(() => new SettingsService());

    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('updates the store when browser storage is unavailable', () => {
    const service = TestBed.runInInjectionContext(() => new SettingsService());
    const exchange = new Exchange();
    exchange.Id = 4;
    exchange.Name = 'Bitfinex';
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    service.setSelectedExchange(exchange);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ exchange }),
    );
  });
});
