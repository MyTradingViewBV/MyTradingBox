import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminComponent } from './admin.component';
import { HeartbeatItem, HeartbeatService } from './services/heartbeat.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import {
  installMatchMediaStub,
  provideComponentTestEnvironment,
} from 'src/testing/test-providers';

describe('AdminComponent', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let component: AdminComponent;
  let exchangeId$: Subject<number>;
  let heartbeatItems$: BehaviorSubject<HeartbeatItem[]>;
  let hb: {
    items$: BehaviorSubject<HeartbeatItem[]>;
    load: ReturnType<typeof vi.fn>;
  };
  let getAllSymbols: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    installMatchMediaStub();
    exchangeId$ = new Subject<number>();
    heartbeatItems$ = new BehaviorSubject<HeartbeatItem[]>([]);
    hb = { items$: heartbeatItems$, load: vi.fn() };
    getAllSymbols = vi.fn().mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        provideComponentTestEnvironment(),
        { provide: HeartbeatService, useValue: hb },
        { provide: ChartService, useValue: { getAllSymbols } },
      ],
    }).compileComponents();

    // Only the exchange stream is replaced; the rest of SettingsService stays real.
    vi.spyOn(TestBed.inject(SettingsService), 'getExchangeId$').mockReturnValue(
      exchangeId$.asObservable(),
    );

    // The constructor wires the subscriptions; ngOnInit (browser/SW probing) is not needed here.
    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates with the notifications segment active and seeded logs', () => {
    expect(component).toBeTruthy();
    expect(component.activeSegment).toBe('notifications');
    expect(component.logs.length).toBeGreaterThan(3);
  });

  it('loads heartbeats and symbols whenever the selected exchange changes', () => {
    exchangeId$.next(2);

    expect(hb.load).toHaveBeenCalledWith(2);
    expect(getAllSymbols).toHaveBeenCalledTimes(1);

    const item = { id: '1', name: 'bot' } as HeartbeatItem;
    heartbeatItems$.next([item]);
    expect(component.heartbeats).toEqual([item]);
  });

  it('tears down its constructor subscriptions on destroy', () => {
    exchangeId$.next(1);
    hb.load.mockClear();

    fixture.destroy();
    exchangeId$.next(3);
    heartbeatItems$.next([{ id: 'late' } as HeartbeatItem]);

    expect(hb.load).not.toHaveBeenCalled();
    expect(component.heartbeats).toEqual([]);
    expect(exchangeId$.observed).toBe(false);
  });
});
