import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LogsService } from './logs.service';

describe('LogsService', () => {
  let service: LogsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LogsService);
  });

  it('starts with the three bootstrap entries', async () => {
    const entries = await firstValueFrom(service.entries$);
    expect(entries.map((e) => e.level)).toEqual(['INFO', 'WARN', 'ERROR']);
  });

  it('prepends a burst of three entries when seeded', async () => {
    const before = await firstValueFrom(service.entries$);
    service.seedBurst();
    const after = await firstValueFrom(service.entries$);

    expect(after.length).toBe(before.length + 3);
    expect(after.slice(3)).toEqual(before);
  });
});
