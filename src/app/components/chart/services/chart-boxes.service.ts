/* Service handling retrieval & basic filtering of box overlays. */
 
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { BoxModel } from '../../../modules/shared/models/chart/boxModel.dto';
import { ChartService } from '../../../modules/shared/services/http/chart.service';

type LegacyBoxModel = BoxModel & { type?: string };

@Injectable({ providedIn: 'root' })
export class ChartBoxesService {
  private readonly marketService = inject(ChartService);

  /** Fetch boxes depending on mode ('boxes' v2 endpoint or 'all' legacy v1) and filter to usable range boxes. */
  getBoxes(symbolName: string, mode: 'boxes' | 'all'): Observable<LegacyBoxModel[]> {
    if (!symbolName) return of([]);
    const obs = mode === 'all'
      ? this.marketService.getBoxes(symbolName, '1d')
      : this.marketService.getBoxesV2(symbolName, '1d');
    return obs.pipe(
      tap(arr => console.log(`[ChartBoxesService] fetched ${arr?.length || 0} raw boxes (mode=${mode})`)),
      map((arr: BoxModel[]) => (arr || []).filter((box): box is LegacyBoxModel => ((box.Type || (box as LegacyBoxModel).type || '') + '').toLowerCase() === 'range')),
      tap(filtered => console.log(`[ChartBoxesService] filtered range boxes count=${filtered.length}`))
    );
  }
}
