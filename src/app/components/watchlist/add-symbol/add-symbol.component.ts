import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { Location, CommonModule, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ChartService } from '../../../modules/shared/services/http/chart.service';
import { UserSymbolsService } from '../../../modules/shared/services/http/user-symbols.service';
import { SymbolModel } from '../../../modules/shared/models/chart/symbol.dto';
import { UserSymbol } from '../../../modules/shared/models/userSymbols/user-symbol.dto';
import { BinanceTickerService, TickerUpdate } from '../services/binance-ticker.service';

interface SymbolVM {
  id: number;
  name: string;
  icon?: string;
  isAdded: boolean;
  adding: boolean;
  removing: boolean;
  userSymbolId?: number;
  price?: number;
  changePct?: number;
}

@Component({
  selector: 'app-add-symbol',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './add-symbol.component.html',
  styleUrl: './add-symbol.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSymbolComponent implements OnInit, OnDestroy {
  searchQuery = '';
  loading = true;

  allSymbols: SymbolVM[] = [];
  filteredSymbols: SymbolVM[] = [];

  /** Maps SymbolId → UserSymbol.Id so we can call delete */
  private userSymbolMap = new Map<number, number>();
  private tickerSub?: Subscription;
  private tickerInterval?: ReturnType<typeof setInterval>;

  private readonly _chartService = inject(ChartService);
  private readonly _userSymbolsService = inject(UserSymbolsService);
  private readonly tickerService = inject(BinanceTickerService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  ngOnInit(): void {
    this._userSymbolsService.getUserSymbols().subscribe({
      next: (userSymbols) => {
        for (const us of userSymbols ?? []) {
          this.userSymbolMap.set(us.SymbolId, us.Id);
        }
        this.loadAllSymbols();
      },
      error: () => this.loadAllSymbols(),
    });
  }

  ngOnDestroy(): void {
    this.tickerSub?.unsubscribe();
    if (this.tickerInterval) clearInterval(this.tickerInterval);
    this.tickerService.disconnect();
  }

  private resolveIconUrl(symbolName: string, apiBase64?: string): string | undefined {
    if (apiBase64) {
      const s = apiBase64.trim();
      return s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
    }
    const name = (symbolName || '').toUpperCase();
    if (name.includes('DOMINANCE')) return undefined;
    const quotes = ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB', 'EUR'];
    let base = name;
    for (const q of quotes) {
      if (name.length > q.length && name.endsWith(q)) {
        base = name.slice(0, -q.length);
        break;
      }
    }
    return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${base.toLowerCase()}.png`;
  }

  onIconError(vm: SymbolVM): void {
    vm.icon = undefined;
    this.cdr.markForCheck();
  }

  private loadAllSymbols(): void {
    this._chartService.getSymbols().subscribe({
      next: (symbols) => {
        this.allSymbols = (symbols ?? []).map(s => ({
          id: s.Id,
          name: s.SymbolName,
          icon: this.resolveIconUrl(s.SymbolName, s.Icon),
          isAdded: this.userSymbolMap.has(s.Id),
          adding: false,
          removing: false,
          userSymbolId: this.userSymbolMap.get(s.Id),
        }));
        this.applyFilter();
        this.loading = false;
        this.cdr.markForCheck();
        this.startTickerStream();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private startTickerStream(): void {
    this.tickerSub = this.tickerService.connect().subscribe();
    // Update prices from ticker map every 2 seconds (avoids excessive CD)
    this.tickerInterval = setInterval(() => {
      this.zone.run(() => {
        this.applyTickerData();
        this.cdr.markForCheck();
      });
    }, 2000);
  }

  private applyTickerData(): void {
    const map = this.tickerService.getLatest();
    if (!map.size) return;
    for (const vm of this.filteredSymbols) {
      const t = map.get(vm.name);
      if (t) {
        vm.price = t.close;
        vm.changePct = t.changePct;
      }
    }
  }

  onSearchInput(): void {
    this.applyFilter();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyFilter();
  }

  private applyFilter(): void {
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (!q) {
      this.filteredSymbols = [...this.allSymbols];
    } else {
      this.filteredSymbols = this.allSymbols.filter(s =>
        s.name.toLowerCase().includes(q)
      );
    }
    this.filteredSymbols.sort((a, b) =>
      (Number(b.isAdded) - Number(a.isAdded)) || a.name.localeCompare(b.name)
    );
    this.applyTickerData();
    this.cdr.markForCheck();
  }

  onRowClick(vm: SymbolVM): void {
    if (vm.adding || vm.removing) return;

    if (vm.isAdded) {
      // Toggle OFF: remove from user profile
      const userSymbolId = vm.userSymbolId;
      if (!userSymbolId) return;
      vm.removing = true;
      this.cdr.markForCheck();
      this._userSymbolsService.deleteUserSymbol(userSymbolId).subscribe({
        next: () => {
          vm.isAdded = false;
          vm.removing = false;
          vm.userSymbolId = undefined;
          this.userSymbolMap.delete(vm.id);
          this.applyFilter();
        },
        error: () => {
          vm.removing = false;
          this.cdr.markForCheck();
        },
      });
    } else {
      // Toggle ON: add to user profile and navigate back
      vm.adding = true;
      this.cdr.markForCheck();
      this._userSymbolsService.addUserSymbol(vm.id).subscribe({
        next: (created) => {
          vm.isAdded = true;
          vm.adding = false;
          vm.userSymbolId = created?.Id;
          this.userSymbolMap.set(vm.id, created?.Id);
          this.router.navigate(['/watchlist']);
        },
        error: () => {
          vm.adding = false;
          this.cdr.markForCheck();
        },
      });
    }
  }

  goBack(): void {
    this.location.back();
  }

  trackBySymbol(_index: number, vm: SymbolVM): number {
    return vm.id;
  }
}
