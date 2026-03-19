import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { HeartbeatService, HeartbeatItem } from './services/heartbeat.service';
import { LogsService, LogEntry } from './services/logs.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { ChartService, UpdateSymbolPayload } from 'src/app/modules/shared/services/http/chart.service';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent {
  segments: Array<{ key: string; title: string }> = [
    { key: 'heartbeat', title: 'Heartbeat' },
    { key: 'logs', title: 'Logs' },
    { key: 'symbols', title: 'Symbols' },
  ];
  activeSegment = 'heartbeat';

  heartbeats: HeartbeatItem[] = [];
  logs: LogEntry[] = [];
  logFilter = '';
  symbols: SymbolModel[] = [];
  selectedSymbolId: number | null = null;
  symbolForm: UpdateSymbolPayload = {
    Id: 0,
    SymbolName: '',
    Active: true,
    RunStatus: '',
    Icon: '',
    ExchangeId: 0,
    IsProduction: true,
  };
  symbolActionMsg = '';
  savingSymbol = false;
  queueingSymbolTask = false;
  private currentExchangeId = 0;
  private hb = inject(HeartbeatService);
  private logsSvc = inject(LogsService);
  private settings = inject(SettingsService);
  private chartService = inject(ChartService);
  private router = inject(Router);
  private location = inject(Location);
  constructor() {
    this.hb.items$.subscribe((items) => (this.heartbeats = items));
    this.logsSvc.entries$.subscribe((entries) => (this.logs = entries));
    // React to selected exchange from NgRx, no localStorage
    this.settings.getExchangeId$().subscribe((exchangeId) => {
      this.currentExchangeId = exchangeId ?? 0;
      this.hb.load(exchangeId);
      this.loadSymbolsForExchange(exchangeId);
    });
    // Keep logs demo seeding for now
    this.logsSvc.entries$.subscribe((entries) => (this.logs = entries));
    this.logsSvc.seedBurst();
  }

  setSegment(key: string): void {
    this.activeSegment = key;
    if (key === 'symbols' && this.currentExchangeId) {
      this.loadSymbolsForExchange(this.currentExchangeId);
    }
  }

  get filteredLogs(): LogEntry[] {
    const q = (this.logFilter || '').toLowerCase();
    if (!q) return this.logs;
    return this.logs.filter((e) =>
      e.level.toLowerCase().includes(q) ||
      e.source.toLowerCase().includes(q) ||
      e.message.toLowerCase().includes(q)
    );
  }

  onBack(): void {
    this.location.back();
  }

  onHome(): void {
    this.router.navigateByUrl('/');
  }

  onRefresh(): void {
    this.loadData();
  }

  onSelectedSymbolChange(): void {
    const selected = this.symbols.find((s) => s.Id === this.selectedSymbolId);
    if (!selected) return;

    this.symbolForm = {
      Id: selected.Id,
      SymbolName: selected.SymbolName,
      Active: !!selected.Active,
      RunStatus: selected.RunStatus || '',
      Icon: selected.Icon || '',
      ExchangeId: this.currentExchangeId,
      IsProduction: true,
    };
    this.symbolActionMsg = '';
  }

  submitSymbolUpdate(): void {
    // Guard against rapid repeat clicks while the previous request is still in-flight.
    if (this.savingSymbol) {
      return;
    }

    if (!this.selectedSymbolId || !this.currentExchangeId) {
      this.symbolActionMsg = 'Select a symbol first.';
      return;
    }

    this.savingSymbol = true;
    this.symbolActionMsg = '';
    this.symbolForm.Id = this.selectedSymbolId;
    this.symbolForm.ExchangeId = this.currentExchangeId;
    this.symbolForm.RunStatus = 'Pending';

    this.chartService
      .updateSymbolById(this.selectedSymbolId, this.currentExchangeId, this.symbolForm)
      .subscribe({
        next: () => {
          this.savingSymbol = false;
          this.symbolActionMsg = `Updated ${this.symbolForm.SymbolName}`;
          this.loadSymbolsForExchange(this.currentExchangeId);
        },
        error: (err) => {
          this.savingSymbol = false;
          this.symbolActionMsg = 'Update failed.';
          console.error('[Admin] symbol update failed', err);
        },
      });
  }

  enqueueSymbolBoxConfig(): void {
    if (this.queueingSymbolTask) {
      return;
    }

    if (!this.currentExchangeId || !this.symbolForm.SymbolName) {
      this.symbolActionMsg = 'Select a symbol first.';
      return;
    }

    this.queueingSymbolTask = true;
    this.symbolActionMsg = '';

    this.chartService
      .enqueueAiTask('box_config_settings', this.symbolForm.SymbolName, this.currentExchangeId)
      .subscribe({
        next: (ok) => {
          this.queueingSymbolTask = false;
          this.symbolActionMsg = ok
            ? `Queued box config for ${this.symbolForm.SymbolName}`
            : 'Queue request failed.';
        },
        error: (err) => {
          this.queueingSymbolTask = false;
          this.symbolActionMsg = 'Queue request failed.';
          console.error('[Admin] enqueue box config failed', err);
        },
      });
  }

  private loadData(): void {
    // Manual refresh will re-seed logs; heartbeat reacts to store changes
    this.logsSvc.seedBurst();
    if (this.currentExchangeId) {
      this.loadSymbolsForExchange(this.currentExchangeId);
    }
  }

  private loadSymbolsForExchange(exchangeId: number): void {
    if (!exchangeId) return;
    this.chartService.getAllSymbols().subscribe({
      next: (symbols) => {
        this.symbols = symbols || [];
        if (
          this.selectedSymbolId != null &&
          this.symbols.some((s) => s.Id === this.selectedSymbolId)
        ) {
          this.onSelectedSymbolChange();
        }
      },
      error: (err) => {
        console.error('[Admin] failed to load symbols', err);
      },
    });
  }
}
