import { TestBed } from '@angular/core/testing';
import { HeartbeatService } from './heartbeat.service';
import { take } from 'rxjs/operators';

describe('HeartbeatService', () => {
  let service: HeartbeatService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HeartbeatService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial items (array) immediately', (done) => {
    service.items$.pipe(take(1)).subscribe((items) => {
      expect(Array.isArray(items)).toBeTrue();
      done();
    });
  });

});
