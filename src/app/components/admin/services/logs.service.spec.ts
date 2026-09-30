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

  it('starts empty and never fabricates entries', async () => {
    const entries = await firstValueFrom(service.entries$);
    expect(entries).toEqual([]);
  });
});
