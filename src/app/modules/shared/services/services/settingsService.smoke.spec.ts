import { TestBed } from '@angular/core/testing';
import { provideStore } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { SettingsService } from './settingsService';
import { Exchange } from '../../models/orders/exchange.dto';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { PERSISTED_KEYS } from 'src/app/store/persistence/state-persistence.meta-reducer';

describe('SettingsService selected exchange persistence', () => {
  const storageKey = PERSISTED_KEYS.exchange;

  function setup(): SettingsService {
    TestBed.configureTestingModule({
      providers: [provideStore(rootReducers, { metaReducers: rootMetaReducers })],
    });
    return TestBed.inject(SettingsService);
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hydrates a valid stored exchange before consumers read the store', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ Id: 2, Name: 'Kraken' }));

    const service = setup();

    expect(await firstValueFrom(service.getSelectedExchange())).toEqual(
      expect.objectContaining({ Id: 2, Name: 'Kraken' }),
    );
  });

  it('migrates the legacy selected-exchange key', async () => {
    localStorage.setItem(
      'mtb.selected-exchange.v1',
      JSON.stringify({ Id: 5, Name: 'Bybit' }),
    );

    const service = setup();

    expect(await firstValueFrom(service.getExchangeId$())).toBe(5);
    expect(localStorage.getItem('mtb.selected-exchange.v1')).toBeNull();
    expect(JSON.parse(localStorage.getItem(storageKey) || '{}')).toEqual({
      Id: 5,
      Name: 'Bybit',
    });
  });

  it('persists a selected exchange through the store', async () => {
    const service = setup();
    const exchange = new Exchange();
    exchange.Id = 3;
    exchange.Name = 'Coinbase';

    service.setSelectedExchange(exchange);

    expect(JSON.parse(localStorage.getItem(storageKey) || '{}')).toEqual({
      Id: 3,
      Name: 'Coinbase',
    });
    expect(await firstValueFrom(service.getSelectedExchange())).toBe(exchange);
  });

  it('removes a malformed stored exchange preference', () => {
    localStorage.setItem(storageKey, '{invalid');

    setup();

    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('updates the store when browser storage is unavailable', async () => {
    const service = setup();
    const exchange = new Exchange();
    exchange.Id = 4;
    exchange.Name = 'Bitfinex';
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    service.setSelectedExchange(exchange);

    expect(await firstValueFrom(service.getSelectedExchange())).toBe(exchange);
  });
});
