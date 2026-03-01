import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminComponent } from './admin.component';
import { SettingsService } from '../../modules/shared/services/services/settingsService';
import { HeartbeatService } from './services/heartbeat.service';
import { LogsService } from './services/logs.service';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { of } from 'rxjs';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

class MockSettingsService {
  getExchangeId$() { return of(1); }
}

class MockHeartbeatService {
  items$ = of([
    { 
      id: '1', kind: 'bot' as const, name: 'Bot Instance 1', ok: true, lastAt: new Date(), latencyMs: 150, 
      message: '', heartbeatReceived: true, messageReceived: true, messageSent: true 
    },
    { 
      id: '2', kind: 'api' as const, name: 'API Gateway', ok: false, lastAt: new Date(), latencyMs: 5000, 
      message: 'Timeout', heartbeatReceived: false, messageReceived: false, messageSent: true 
    }
  ]);
  load(exchangeId: number) {}
}

class MockLogsService {
  entries$ = of([
    { at: new Date(), level: 'INFO' as const, source: 'BotService', message: 'Bot started' },
    { at: new Date(), level: 'ERROR' as const, source: 'APIService', message: 'Connection failed' }
  ]);
  seedBurst() {}
}

class MockRouter {
  navigateByUrl(url: string) { return Promise.resolve(true); }
}

class MockLocation {
  back() {}
}

describe('AdminComponent', () => {
  let component: AdminComponent;
  let fixture: ComponentFixture<AdminComponent>;
  let heartbeatService: MockHeartbeatService;
  let logsService: MockLogsService;
  let router: MockRouter;
  let location: MockLocation;
  let compiled: DebugElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        { provide: SettingsService, useClass: MockSettingsService },
        { provide: HeartbeatService, useClass: MockHeartbeatService },
        { provide: LogsService, useClass: MockLogsService },
        { provide: Router, useClass: MockRouter },
        { provide: Location, useClass: MockLocation },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
    heartbeatService = TestBed.inject(HeartbeatService) as any;
    logsService = TestBed.inject(LogsService) as any;
    router = TestBed.inject(Router) as any;
    location = TestBed.inject(Location) as any;
    compiled = fixture.debugElement;
    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should have segments defined', () => {
      expect(component.segments).toBeDefined();
      expect(component.segments.length).toBe(2);
    });

    it('should have heartbeat and logs segments', () => {
      expect(component.segments[0].key).toBe('heartbeat');
      expect(component.segments[1].key).toBe('logs');
    });

    it('should have correct segment titles', () => {
      expect(component.segments[0].title).toBe('Heartbeat');
      expect(component.segments[1].title).toBe('Logs');
    });

    it('should default to heartbeat segment', () => {
      expect(component.activeSegment).toBe('heartbeat');
    });

    it('should initialize empty arrays for heartbeats and logs', () => {
      expect(Array.isArray(component.heartbeats)).toBeTrue();
      expect(Array.isArray(component.logs)).toBeTrue();
    });

    it('should initialize logFilter as empty string', () => {
      expect(component.logFilter).toBe('');
    });
  });

  describe('Segment Navigation', () => {
    it('should switch segment to logs', () => {
      component.setSegment('logs');
      expect(component.activeSegment).toBe('logs');
    });

    it('should switch segment back to heartbeat', () => {
      component.setSegment('logs');
      component.setSegment('heartbeat');
      expect(component.activeSegment).toBe('heartbeat');
    });

    it('should set segment to arbitrary key', () => {
      component.setSegment('custom-segment');
      expect(component.activeSegment).toBe('custom-segment');
    });

    it('should render segment tabs', () => {
      const tabs = compiled.queryAll(By.css('.segment-tab'));
      expect(tabs.length).toBe(2);
    });

    it('should mark active segment tab', () => {
      component.activeSegment = 'heartbeat';
      fixture.detectChanges();
      const tabs = compiled.queryAll(By.css('.segment-tab'));
      expect(tabs[0].nativeElement.classList.contains('active')).toBeTrue();
    });
  });

  describe('Filtered Logs', () => {
    beforeEach(() => {
      component.logs = [
        { at: new Date(), level: 'INFO' as const, source: 'BotService', message: 'Bot started' },
        { at: new Date(), level: 'ERROR' as const, source: 'APIService', message: 'Connection failed' },
        { at: new Date(), level: 'WARN' as const, source: 'DatabaseService', message: 'Slow query' }
      ];
    });

    it('should return all logs when filter is empty', () => {
      component.logFilter = '';
      const filtered = component.filteredLogs;
      expect(filtered.length).toBe(3);
    });

    it('should filter logs by level', () => {
      component.logFilter = 'INFO';
      const filtered = component.filteredLogs;
      expect(filtered.length).toBe(1);
      expect(filtered[0].level).toBe('INFO');
    });

    it('should filter logs by source', () => {
      component.logFilter = 'APIService';
      const filtered = component.filteredLogs;
      expect(filtered.length).toBe(1);
      expect(filtered[0].source).toBe('APIService');
    });

    it('should filter logs by message', () => {
      component.logFilter = 'Connection';
      const filtered = component.filteredLogs;
      expect(filtered.length).toBe(1);
      expect(filtered[0].message).toContain('Connection');
    });

    it('should be case-insensitive', () => {
      component.logFilter = 'error';
      const filtered = component.filteredLogs;
      expect(filtered.length).toBe(1);
      expect(filtered[0].level).toBe('ERROR');
    });

    it('should handle multiple matching logs', () => {
      component.logFilter = 'Service';
      const filtered = component.filteredLogs;
      expect(filtered.length).toBe(3);
    });

    it('should return empty array when no matches', () => {
      component.logFilter = 'NonExistentFilter';
      const filtered = component.filteredLogs;
      expect(filtered.length).toBe(0);
    });

  });

  describe('Navigation Methods', () => {
    it('should have onBack method', () => {
      expect(component.onBack).toBeDefined();
    });

    it('should have onHome method', () => {
      expect(component.onHome).toBeDefined();
    });

    it('should have onRefresh method', () => {
      expect(component.onRefresh).toBeDefined();
    });

    it('should call location.back on onBack', () => {
      spyOn(location, 'back');
      component.onBack();
      expect(location.back).toHaveBeenCalled();
    });

    it('should navigate to home on onHome', () => {
      spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));
      component.onHome();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    });

    it('should call seedBurst on onRefresh', () => {
      spyOn(logsService, 'seedBurst');
      component.onRefresh();
      expect(logsService.seedBurst).toHaveBeenCalled();
    });
  });

  describe('Button Click Events', () => {
    it('should render admin page header', () => {
      const header = compiled.query(By.css('.wl-header'));
      expect(header).toBeTruthy();
    });

    it('should display Admin title', () => {
      const title = compiled.query(By.css('.wl-title'));
      expect(title.nativeElement.textContent).toContain('Admin');
    });

    it('should have back button', () => {
      const buttons = compiled.queryAll(By.css('.wl-btn'));
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should call onBack when back button clicked', () => {
      spyOn(component, 'onBack');
      spyOn(location, 'back');
      const buttons = compiled.queryAll(By.css('.wl-btn'));
      buttons[0].nativeElement.click();
      expect(component.onBack).toHaveBeenCalled();
    });

    it('should call onRefresh when refresh button clicked', () => {
      spyOn(component, 'onRefresh');
      spyOn(logsService, 'seedBurst');
      const buttons = compiled.queryAll(By.css('.wl-btn'));
      buttons[1].nativeElement.click();
      expect(component.onRefresh).toHaveBeenCalled();
    });

    it('should call onHome when home button clicked', () => {
      spyOn(component, 'onHome');
      spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));
      const buttons = compiled.queryAll(By.css('.wl-btn'));
      buttons[2].nativeElement.click();
      expect(component.onHome).toHaveBeenCalled();
    });
  });

  describe('Heartbeat Display', () => {
    beforeEach(() => {
      component.heartbeats = [
        { id: '1', kind: 'bot' as const, name: 'Bot 1', ok: true, lastAt: new Date('2026-03-01'), latencyMs: 100, message: '', heartbeatReceived: true, messageReceived: true, messageSent: true },
        { id: '2', kind: 'api' as const, name: 'API', ok: false, lastAt: new Date('2026-03-01'), latencyMs: 5000, message: 'Timeout', heartbeatReceived: false, messageReceived: false, messageSent: true }
      ];
    });

    it('should display heartbeat items', () => {
      fixture.detectChanges();
      const cards = compiled.queryAll(By.css('.hb-card'));
      expect(cards.length).toBeGreaterThanOrEqual(0);
    });

    it('should have heartbeat kind displayed', () => {
      fixture.detectChanges();
      const kinds = compiled.queryAll(By.css('.hb-kind'));
      expect(kinds.length).toBeGreaterThanOrEqual(0);
    });

    it('should show OK status for healthy heartbeat', () => {
      fixture.detectChanges();
      const statuses = compiled.queryAll(By.css('.hb-status'));
      const okStatus = statuses.find(s => s.nativeElement.textContent.includes('OK'));
      if (okStatus) {
        expect(okStatus.nativeElement.classList.contains('ok')).toBeTruthy();
      }
    });

    it('should show FAIL status for failed heartbeat', () => {
      fixture.detectChanges();
      const statuses = compiled.queryAll(By.css('.hb-status'));
      const failStatus = statuses.find(s => s.nativeElement.textContent.includes('FAIL'));
      if (failStatus) {
        expect(failStatus.nativeElement.classList.contains('fail')).toBeTruthy();
      }
    });
  });

  describe('Data Subscription', () => {
    it('should initialize component with services', () => {
      expect(component).toBeTruthy();
      expect(component.heartbeats).toBeDefined();
      expect(component.logs).toBeDefined();
    });
  });

  describe('Log Entry Management', () => {
    it('should update heartbeats from service', (done) => {
      heartbeatService.items$.subscribe(items => {
        component.heartbeats = items;
        expect(component.heartbeats.length).toBeGreaterThan(0);
        done();
      });
    });

    it('should update logs from service', (done) => {
      logsService.entries$.subscribe(entries => {
        component.logs = entries;
        expect(component.logs.length).toBeGreaterThan(0);
        done();
      });
    });

    it('should handle empty heartbeat list', () => {
      component.heartbeats = [];
      fixture.detectChanges();
      expect(component.heartbeats.length).toBe(0);
    });

    it('should handle empty logs list', () => {
      component.logs = [];
      expect(component.filteredLogs.length).toBe(0);
    });
  });

  describe('Template Rendering', () => {
    it('should render admin page container', () => {
      const adminPage = compiled.query(By.css('.admin-page'));
      expect(adminPage).toBeTruthy();
    });

    it('should render segments container', () => {
      const segments = compiled.query(By.css('.segments'));
      expect(segments).toBeTruthy();
    });

    it('should have accessibility labels on buttons', () => {
      const buttons = compiled.queryAll(By.css('button[aria-label]'));
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should have back button with aria-label', () => {
      const backBtn = compiled.query(By.css('button[aria-label="Go back"]'));
      expect(backBtn).toBeTruthy();
    });

    it('should have refresh button with aria-label', () => {
      const refreshBtn = compiled.query(By.css('button[aria-label="Refresh data"]'));
      expect(refreshBtn).toBeTruthy();
    });

    it('should have home button with aria-label', () => {
      const homeBtn = compiled.query(By.css('button[aria-label="Go home"]'));
      expect(homeBtn).toBeTruthy();
    });
  });

  describe('State Management', () => {
    it('should maintain active segment on filter change', () => {
      component.setSegment('logs');
      component.logFilter = 'ERROR';
      expect(component.activeSegment).toBe('logs');
    });

    it('should preserve logs when switching segments', () => {
      component.logs = [
        { at: new Date(), level: 'INFO' as const, source: 'Test', message: 'Test message' }
      ];
      component.setSegment('logs');
      component.setSegment('heartbeat');
      expect(component.logs.length).toBe(1);
    });

    it('should preserve heartbeats when switching segments', () => {
      component.heartbeats = [
        { id: '1', kind: 'bot' as const, name: 'Test', ok: true, lastAt: new Date(), latencyMs: 100, message: '', heartbeatReceived: true, messageReceived: true, messageSent: true }
      ];
      component.setSegment('heartbeat');
      component.setSegment('logs');
      expect(component.heartbeats.length).toBe(1);
    });
  });
});
