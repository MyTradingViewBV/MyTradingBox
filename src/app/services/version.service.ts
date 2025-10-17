import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class VersionService {
  private currentVersion: string | null = null;

  constructor(private http: HttpClient) {}

  loadLocalVersion(): Promise<string | null> {
    return this.http
      .get<{ version: string }>('assets/version.json', {
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
      .get<{ version: string }>('assets/version.json', {
        headers: { 'Cache-Control': 'no-cache' },
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
