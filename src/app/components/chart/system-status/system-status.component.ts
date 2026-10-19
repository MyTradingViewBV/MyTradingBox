import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { combineLatest, interval, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AppService } from '../../../modules/shared/services/services/appService';
import { BotHeartbeat, isHeartbeatGreen } from '../../admin/models/bot-heartbeat.model';

/** Doubles as the i18n key suffix (CHART.STATUS_API_ONLINE etc.). */
export type SystemStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export interface BotStatus {
  name: string;
  online: boolean;
  lastSeen: Date | null;
}

/** Re-check API and bots every minute; bot heartbeats turn red after 2 minutes. */
export const SYSTEM_STATUS_POLL_MS = 60_000;

/** Gateway errors mean the proxy is up but the API behind it is not. */
const OFFLINE_HTTP_STATUSES = [0, 502, 503, 504];

/** Small anonymous endpoint used as ping; the API has nothing at its root (404 every poll). */
const PING_PATH = 'Exchanges';

/**
 * Small chart-toolbar indicator: is the API reachable and are the bots sending
 * heartbeats. Bot status comes from the admin-only /BotHeartbeat endpoint, so
 * it is only shown to admins; for them a click opens the heartbeat overview.
 */
@Component({
  selector: 'app-system-status',
  standalone: true,
  imports: [NgTemplateOutlet, TranslateModule],
  templateUrl: './system-status.component.html',
  styleUrl: './system-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemStatusComponent implements OnInit {
  /** Exchange whose bots are shown; 0 shows all bots. */
  readonly exchangeId = input<number>(0);

  readonly apiStatus = signal<SystemStatus>('UNKNOWN');
  readonly botList = signal<BotStatus[] | null>(null);
  readonly isAdmin = signal(false);

  readonly offlineBots = computed(() => (this.botList() ?? []).filter((b) => !b.online));
  readonly botsStatus = computed<SystemStatus>(() => {
    const bots = this.botList();
    if (!bots || this.apiStatus() === 'OFFLINE') return 'UNKNOWN';
    return bots.length > 0 && this.offlineBots().length === 0 ? 'ONLINE' : 'OFFLINE';
  });

  private readonly http = inject(HttpClient);
  private readonly appService = inject(AppService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly exchangeId$ = toObservable(this.exchangeId);

  ngOnInit(): void {
    combineLatest([
      this.appService.isAdmin(),
      this.exchangeId$,
      interval(SYSTEM_STATUS_POLL_MS).pipe(startWith(0)),
    ])
      .pipe(
        switchMap(([isAdmin, exchangeId]) => {
          this.isAdmin.set(isAdmin);
          return this.check(exchangeId ?? 0);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  openHeartbeats(): void {
    void this.router.navigate(['/admin'], { queryParams: { section: 'heartbeat' } });
  }

  private check(exchangeId: number) {
    return this.pingApi().pipe(
      switchMap((apiOnline) => {
        this.apiStatus.set(apiOnline ? 'ONLINE' : 'OFFLINE');
        if (!apiOnline || !this.isAdmin()) {
          this.botList.set(null);
          return of(null);
        }
        return this.loadBots(exchangeId).pipe(map((bots) => this.botList.set(bots)));
      }),
    );
  }

  /** Any HTTP answer from the API counts as online, except network/gateway failures. */
  private pingApi() {
    return this.http.get(`${environment.apiUrl}${PING_PATH}`, { responseType: 'text' }).pipe(
      map(() => true),
      catchError((err: HttpErrorResponse) =>
        of(!OFFLINE_HTTP_STATUSES.includes(err?.status ?? 0)),
      ),
    );
  }

  private loadBots(exchangeId: number) {
    const query = exchangeId > 0 ? `?exchangeId=${exchangeId}` : '';
    return this.http.get<BotHeartbeat[]>(`${environment.apiUrl}BotHeartbeat${query}`).pipe(
      map((rows) => mapBotStatuses(rows ?? [])),
      catchError(() => of(null)),
    );
  }
}

/** One entry per bot name (a bot can report per exchange); offline first. */
export function mapBotStatuses(rows: BotHeartbeat[]): BotStatus[] {
  const byName = new Map<string, BotStatus>();
  for (const row of rows) {
    const lastSeen = row.HeartbeatReceivedAt ? new Date(row.HeartbeatReceivedAt) : null;
    const online = isHeartbeatGreen(row);
    const existing = byName.get(row.BotName);
    if (!existing) {
      byName.set(row.BotName, { name: row.BotName, online, lastSeen });
      continue;
    }
    existing.online = existing.online && online;
    if (lastSeen && (!existing.lastSeen || lastSeen > existing.lastSeen)) {
      existing.lastSeen = lastSeen;
    }
  }
  return [...byName.values()].sort(
    (a, b) => Number(a.online) - Number(b.online) || a.name.localeCompare(b.name),
  );
}
