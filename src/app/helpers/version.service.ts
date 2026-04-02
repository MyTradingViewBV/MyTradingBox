import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class VersionService {
  private currentVersion: string | null = null;
  private readonly http = inject(HttpClient);
  private readonly versionUrl = 'assets/version.json';

  constructor() {}

  private buildVersionUrl(bypassSw = false): string {
    if (!bypassSw) return this.versionUrl;

    const ts = Date.now();
    // ngsw-bypass ensures Angular SW does a real network fetch.
    return `${this.versionUrl}?ngsw-bypass=true&t=${ts}`;
  }

  loadLocalVersion(): Promise<string | null> {
    return this.http
      .get<{ version: string }>(this.versionUrl, {
        headers: { 'Cache-Control': 'no-cache' },
      })

      .toPromise()
      .then((data) => {
        if (data) {
          this.currentVersion = data.version;
        }
        return this.currentVersion;
      });
  }

  checkRemoteVersion(): Promise<void> {
    return this.http
      .get<{ version: string }>(this.buildVersionUrl(true), {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      })
      .toPromise()
      .then((remote) => {
        if (remote) {
          if (this.currentVersion && remote.version !== this.currentVersion) {
            console.warn(
              `New version available: ${remote.version} (current: ${this.currentVersion})`,
            );
            document.location.reload(); // force update
          }
        }
      });
  }
}
