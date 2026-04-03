import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BackButtonComponent } from '../shared/back-button/back-button.component';

type ReleaseEntry = {
  title: string;
  summary: string;
};

type ReleaseVersion = {
  version: string;
  date: string;
  tag: string;
  entries: ReleaseEntry[];
};

@Component({
  selector: 'app-release-notes',
  standalone: true,
  imports: [CommonModule, BackButtonComponent],
  templateUrl: './release-notes.component.html',
  styleUrls: ['./release-notes.component.scss'],
})
export class ReleaseNotesComponent {
  releases: ReleaseVersion[] = [];

  private readonly _http = inject(HttpClient);

  constructor() {
    // Load generated mock data derived from updates/RELEASE_LOG.md.
    this._http.get<ReleaseVersion[]>('assets/release-notes.mock.json').subscribe({
      next: (releases) => {
        this.releases = Array.isArray(releases) ? releases : [];
      },
      error: () => {
        this.releases = [];
      },
    });
  }
}