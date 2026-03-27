import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
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
  readonly releases: ReleaseVersion[] = [
    {
      version: 'v0.3.4',
      date: '25 Mar 2026',
      tag: 'Current',
      entries: [
        {
          title: 'Release notes screen added',
          summary: 'Tapping the app version now opens a dedicated changelog view inside settings.',
        },
        {
          title: 'Settings navigation tightened',
          summary: 'Version and alerts rows now route to focused settings sub-pages instead of acting like toggles.',
        },
        {
          title: 'Mock product updates',
          summary: 'Prepared a temporary per-version history layout that can later be fed by real release data.',
        },
      ],
    },
    {
      version: 'v0.3.3',
      date: '12 Mar 2026',
      tag: 'Stability',
      entries: [
        {
          title: 'Watchlist responsiveness',
          summary: 'Improved list refresh flow so symbols feel more consistent after exchange changes.',
        },
        {
          title: 'Push notification groundwork',
          summary: 'Expanded notification plumbing to support richer update prompts and logging.',
        },
      ],
    },
    {
      version: 'v0.3.2',
      date: '28 Feb 2026',
      tag: 'UX',
      entries: [
        {
          title: 'Settings cleanup',
          summary: 'Simplified the settings surface and separated alert controls into their own page.',
        },
        {
          title: 'Theme handling updates',
          summary: 'Refined dark mode persistence and app-wide theme switching behavior.',
        },
      ],
    },
  ];
}