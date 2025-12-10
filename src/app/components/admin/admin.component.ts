import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { HeartbeatService, HeartbeatItem } from './services/heartbeat.service';
import { LogsService, LogEntry } from './services/logs.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent {
  segments: Array<{ key: string; title: string }> = [
    { key: 'heartbeat', title: 'Heartbeat' },
    { key: 'logs', title: 'Logs' },
  ];
  activeSegment = 'heartbeat';

  heartbeats: HeartbeatItem[] = [];
  logs: LogEntry[] = [];
  logFilter = '';
  private hb = inject(HeartbeatService);
  private logsSvc = inject(LogsService);
  private router = inject(Router);
  private location = inject(Location);
  constructor() {
    this.hb.items$.subscribe((items) => (this.heartbeats = items));
    this.logsSvc.entries$.subscribe((entries) => (this.logs = entries));
    // Seed additional mock data when Admin opens
    this.hb.seedExtraMocks();
    this.logsSvc.seedBurst();
  }

  setSegment(key: string): void {
    this.activeSegment = key;
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

  private loadData(): void {
    // Trigger services to refresh or reseed demo data
    this.hb.seedExtraMocks();
    this.logsSvc.seedBurst();
  }
}
