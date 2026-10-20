import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { appFeature } from 'src/app/store/app/app.reducer';
import {
  ChangeKind,
  FriendlyRelease,
  ReleaseVersion,
  formatReleaseTime,
  readLastSeen,
  toFriendlyReleases,
  unseenVersions,
  writeLastSeen,
} from './whats-new';

/** Releases shown before "Show older releases". */
const INITIAL_RELEASES = 5;
/** Changes shown per group before "Show all". */
const INITIAL_ITEMS = 6;
const KIND_ICONS: Record<ChangeKind, string> = { new: '✨', fixed: '🛠', improved: '⚡' };

@Component({
  selector: 'app-dashboard-whats-new',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './whats-new-tab.component.html',
  styleUrl: './whats-new-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsNewTabComponent {
  private readonly _http = inject(HttpClient);

  private readonly releases = signal<FriendlyRelease[]>([]);
  private readonly loaded = signal(false);
  private readonly unseen = signal<Set<string>>(new Set());
  private readonly expanded = signal<Set<string>>(new Set());
  readonly showAllReleases = signal(false);
  /** App language ('en' / 'nl'): the deploy time is written in it, in the device's time zone. */
  private readonly language = toSignal(inject(Store).select(appFeature.selectLanguage), {
    initialValue: 'nl',
  });

  /** Everything the template reads, precomputed (templates must not call methods). */
  readonly whatsNewVm = computed(() => {
    const all = this.releases();
    const unseen = this.unseen();
    const expanded = this.expanded();
    const lang = this.language();
    const visible = this.showAllReleases() ? all : all.slice(0, INITIAL_RELEASES);
    return {
      loaded: this.loaded(),
      empty: !all.length,
      canShowOlder: visible.length < all.length,
      releases: visible.map((release, index) => ({
        version: release.version,
        date: formatReleaseTime(release.timestamp, lang) || release.date,
        timestamp: release.timestamp ?? null,
        count: release.count,
        latest: index === 0,
        isNew: unseen.has(release.version),
        groups: release.groups.map((group) => {
          const open = expanded.has(`${release.version}|${group.kind}`);
          return {
            kind: group.kind,
            icon: KIND_ICONS[group.kind],
            labelKey: `DASHBOARD.KIND_${group.kind.toUpperCase()}`,
            items: open ? group.items : group.items.slice(0, INITIAL_ITEMS),
            total: group.items.length,
            canExpand: !open && group.items.length > INITIAL_ITEMS,
          };
        }),
      })),
    };
  });

  constructor() {
    this._http
      .get<ReleaseVersion[]>('assets/release-notes.mock.json')
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (raw) => this.apply(Array.isArray(raw) ? raw : []),
        error: () => this.apply([]),
      });
  }

  expand(version: string, kind: string): void {
    this.expanded.update((set) => new Set(set).add(`${version}|${kind}`));
  }

  private apply(raw: ReleaseVersion[]): void {
    const releases = toFriendlyReleases(raw);
    this.releases.set(releases);
    this.unseen.set(unseenVersions(releases, readLastSeen()));
    this.loaded.set(true);
    // Opening the tab counts as seeing the latest release; badges stay until the next visit.
    if (releases.length) writeLastSeen(releases[0].version);
  }
}
