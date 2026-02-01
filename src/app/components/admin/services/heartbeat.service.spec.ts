import { TestBed } from '@angular/core/testing';
import { HeartbeatService } from './heartbeat.service';

describe('HeartbeatService', () => {
  let service: HeartbeatService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HeartbeatService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial items', (done) => {
    service.items$.subscribe((items) => {
      if (items && items.length) {
        expect(items.some((i) => i.id === 'api-markets')).toBeTrue();
        done();
      }
    });
  });

  it('should seed extra mocks without duplicates', (done) => {
    service.seedExtraMocks();
    service.items$.subscribe((items) => {
      const ids = items.map((i) => i.id);
      const hasCache = ids.includes('svc-cache');
      expect(hasCache).toBeTrue();
      // no duplicate ids
      const set = new Set(ids);
      expect(set.size).toBe(ids.length);
      done();
    });
  });
});
