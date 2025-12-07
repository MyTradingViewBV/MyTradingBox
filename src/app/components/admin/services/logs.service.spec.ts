import { TestBed } from '@angular/core/testing';
import { LogsService } from './logs.service';

describe('LogsService', () => {
  let service: LogsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LogsService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial entries', (done) => {
    service.entries$.subscribe((entries) => {
      if (entries && entries.length) {
        expect(entries[0].message).toBeDefined();
        done();
      }
    });
  });

  it('should seed burst entries', (done) => {
    service.seedBurst();
    service.entries$.subscribe((entries) => {
      expect(entries.length).toBeGreaterThan(3);
      done();
    });
  });
});
