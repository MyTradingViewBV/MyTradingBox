import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardComponent } from './dashboard.component';
import { DashboardDataService } from './dashboard-data.service';
import { HeartbeatService } from '../admin/services/heartbeat.service';
import { OverviewTabComponent } from './overview-tab/overview-tab.component';
import { readOrder } from './timeframes-tab/timeframes-tab.component';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import {
  installMatchMediaStub,
  provideComponentTestEnvironment,
} from 'src/testing/test-providers';
import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';

const candles: Candle[] = [
  { Symbol: 'BTCUSDT', Timeframe: '12m', Time: '2026-10-20T10:00:00Z', Open: 100, High: 110, Low: 90, Close: 105, Volume: 1 },
  { Symbol: 'BTCUSDT', Timeframe: '12m', Time: '2026-10-20T10:12:00Z', Open: 105, High: 112, Low: 101, Close: 108, Volume: 1 },
];

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let data: Record<string, ReturnType<typeof vi.fn>>;
  let heartbeats: { items$: Observable<unknown[]>; load: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    installMatchMediaStub();
    localStorage.removeItem('mtb.dashboard.tab');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    data = {
      candles: vi.fn(() => of(candles)),
      boxesPerTimeframe: vi.fn(() => of({})),
      watchlist: vi.fn(() => of([])),
      aiQueueCount: vi.fn(() => of(3)),
      pendingNotifications: vi.fn(() => of(1)),
      calendarToday: vi.fn(() => of([])),
      marketMood: vi.fn(() => of({ fearGreed: { value: 70, label: 'Greed' }, btcDominance: 57.4 })),
      symbols: vi.fn(() => of(['ETHUSDT'])),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideComponentTestEnvironment(),
        { provide: DashboardDataService, useValue: data },
        { provide: HeartbeatService, useValue: (heartbeats = { items$: of([]), load: vi.fn() }) },
      ],
    }).compileComponents();

    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(SettingsService), 'waitForExchangeId$').mockReturnValue(of(1));
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    // The overview's refresh timer never settles, so wait one tick instead of whenStable().
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController)
      .match(() => true)
      .forEach((req) => req.flush([]));
    localStorage.removeItem('mtb.dashboard.tab');
    vi.restoreAllMocks();
  });

  const tabs = () => fixture.debugElement.queryAll(By.css('[role="tab"]'));
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('renders five tabs with the overview selected', () => {
    expect(tabs().map((t) => t.nativeElement.textContent.trim())).toEqual([
      'DASHBOARD.TAB_OVERVIEW',
      'DASHBOARD.TAB_WHATS_NEW',
      'DASHBOARD.TAB_TIMEFRAMES',
      'DASHBOARD.TAB_TESTS',
      'DASHBOARD.TAB_REPORT',
    ]);
    expect(tabs()[0].nativeElement.getAttribute('aria-selected')).toBe('true');
    expect(fixture.debugElement.query(By.css('app-dashboard-overview'))).toBeTruthy();
  });

  it('shows the BTC card and market mood on the overview', () => {
    expect(data['candles']).toHaveBeenCalledWith('BTCUSDT', '12m', 120);
    expect(text()).toContain('DASHBOARD.BTC_24H');
    expect(text()).toContain('DASHBOARD.FEAR_GREED');
    // The test store's language is 'nl', so numbers use a decimal comma.
    expect(text()).toContain('57,4%');
  });

  it('does not call the admin-only endpoints or show their cards for a regular user', () => {
    expect(data['pendingNotifications']).not.toHaveBeenCalled();
    expect(data['aiQueueCount']).not.toHaveBeenCalled();
    expect(heartbeats.load).not.toHaveBeenCalled();
    expect(text()).not.toContain('DASHBOARD.BOT_HEALTH');
    expect(text()).not.toContain('DASHBOARD.QUEUES');
  });

  it('loads the admin-only sources once the admin role arrives', async () => {
    const tab = TestBed.createComponent(OverviewTabComponent);
    const settle = async () => {
      tab.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 0));
      tab.detectChanges();
    };
    await settle();
    expect(data['aiQueueCount']).not.toHaveBeenCalled();
    tab.componentRef.setInput('isAdmin', true);
    await settle();
    const tabText = (tab.nativeElement as HTMLElement).textContent ?? '';
    expect(data['aiQueueCount']).toHaveBeenCalled();
    expect(data['pendingNotifications']).toHaveBeenCalled();
    expect(heartbeats.load).toHaveBeenCalled();
    expect(tabText).toContain('DASHBOARD.BOT_HEALTH');
    expect(tabText).toContain('DASHBOARD.AI_QUEUE');
    tab.destroy();
  });

  it('switches tabs and remembers the choice', () => {
    tabs()[2].nativeElement.click();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('app-dashboard-timeframes'))).toBeTruthy();
    expect(localStorage.getItem('mtb.dashboard.tab')).toBe('timeframes');
    // One request per chart timeframe for the selected symbol.
    expect(data['candles'].mock.calls.filter((c) => c[2] === 200)).toHaveLength(10);
  });

  it('reorders the timeframe charts and stores the order on the device', () => {
    tabs()[2].nativeElement.click();
    fixture.detectChanges();
    const timeframes = () =>
      fixture.debugElement.queryAll(By.css('.grid .tf')).map((el) => (el.nativeElement as HTMLElement).textContent);
    expect(timeframes().slice(0, 2)).toEqual(['1m', '3m']);

    fixture.debugElement.query(By.css('.tool-btn')).nativeElement.click();
    fixture.detectChanges();
    // "Later" button of the first tile.
    fixture.debugElement.queryAll(By.css('.move-btn'))[1].nativeElement.click();
    fixture.detectChanges();

    expect(timeframes().slice(0, 2)).toEqual(['3m', '1m']);
    expect(JSON.parse(localStorage.getItem('mtb.dashboard.timeframeOrder') ?? '[]').slice(0, 2)).toEqual(['3m', '1m']);
    expect(readOrder()).toHaveLength(10);
  });

  it('ignores unknown or missing timeframes in a stored order', () => {
    localStorage.setItem('mtb.dashboard.timeframeOrder', JSON.stringify(['1d', 'bogus', '1d', '1m']));
    const order = readOrder();
    expect(order.slice(0, 3)).toEqual(['1d', '1m', '3m']);
    expect(order).toHaveLength(10);
    localStorage.setItem('mtb.dashboard.timeframeOrder', '{broken');
    expect(readOrder()[0]).toBe('1m');
  });

  it('shows the test counts per component on the Tests tab', () => {
    tabs()[3].nativeElement.click();
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('assets/test-counts.json')
      .flush({
        generatedAt: '2026-10-20T20:00:00.000Z',
        totals: { files: 2, tests: 7, unit: 7, smoke: 0, e2e: 0 },
        components: [
          { name: 'chart', area: 'components', files: 2, tests: 7, unit: 7, smoke: 0, e2e: 0 },
          { name: 'header', area: 'components', files: 0, tests: 0, unit: 0, smoke: 0, e2e: 0 },
        ],
      });
    fixture.detectChanges();
    const rows = fixture.debugElement.queryAll(By.css('app-dashboard-tests tbody tr'));
    expect(rows.map((r) => r.nativeElement.querySelector('.name').textContent.trim())).toEqual(['chart', 'header']);
    expect(rows[1].nativeElement.classList).toContain('none');
    expect(text()).toContain('DASHBOARD.TESTS_UNTESTED');
  });

  it('moves between tabs with the arrow keys', () => {
    const list = fixture.debugElement.query(By.css('[role="tablist"]'));
    list.triggerEventHandler('keydown', new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();
    // Wraps around from the first tab to the last one.
    expect(fixture.debugElement.query(By.css('app-dashboard-report'))).toBeTruthy();
  });
});
