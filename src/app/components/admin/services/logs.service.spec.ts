import { TestBed } from '@angular/core/testing';
import { LogsService } from './logs.service';
import { take } from 'rxjs/operators';

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
    service.entries$.pipe(take(1)).subscribe((entries) => {
      expect(entries && entries.length >= 0).toBeTrue();
      done();
    });
  });

  it('should seed burst entries', (done) => {
    service.seedBurst();
    service.entries$.pipe(take(1)).subscribe((entries) => {
      expect(entries.length).toBeGreaterThan(3);
      done();
    });
  });
});
