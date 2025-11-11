/* Service handling retrieval & basic filtering of box overlays. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { ChartService } from '../../../modules/shared/services/http/chart.service';

@Injectable({ providedIn: 'root' })
export class ChartBoxesService {
  constructor(private marketService: ChartService) {}

  /** Fetch boxes depending on mode ('boxes' v2 endpoint or 'all' legacy v1) and filter to usable range boxes. */
  getBoxes(symbolName: string, mode: 'boxes' | 'all'): Observable<any[]> {
    if (!symbolName) return of([]);
    const obs = mode === 'all'
      ? this.marketService.getBoxes(symbolName, '1d')
      : this.marketService.getBoxesV2(symbolName, '1d');
    return obs.pipe(
      tap(arr => console.log(`[ChartBoxesService] fetched ${arr?.length || 0} raw boxes (mode=${mode})`)),
      map((arr: any[]) => (arr || []).filter(b => ((b.Type || b.type || '') + '').toLowerCase() === 'range')),
      tap(filtered => console.log(`[ChartBoxesService] filtered range boxes count=${filtered.length}`))
    );
  }
}
