import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ChartService } from '../../../modules/shared/services/http/chart.service';
import { UserSymbolsService } from '../../../modules/shared/services/http/user-symbols.service';
import { SymbolModel } from '../../../modules/shared/models/chart/symbol.dto';
import { UserSymbol } from '../../../modules/shared/models/userSymbols/user-symbol.dto';
import { BinanceTickerService, TickerUpdate } from '../services/binance-ticker.service';
import { TranslateModule } from '@ngx-translate/core';
import { BackButtonComponent } from '../../shared/back-button/back-button.component';

interface SymbolVM {
  id: number;
  exchangeId: number;
  exchangeName?: string;
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
  imports: [CommonModule, FormsModule, DecimalPipe, TranslateModule, BackButtonComponent],
  templateUrl: './add-symbol.component.html',
  styleUrl: './add-symbol.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSymbolComponent implements OnInit, OnDestroy {
  searchQuery = '';
  loading = true;

  allSymbols: SymbolVM[] = [];
  filteredSymbols: SymbolVM[] = [];
  exchangeFilters: Array<{ id: number; name: string }> = [];
  selectedExchangeId: number | 'all' = 'all';

  /** Maps `${exchangeId}:${symbolId}` → UserSymbol.Id so we can call delete */
  private userSymbolMap = new Map<string, number>();
  private tickerSub?: Subscription;
  private tickerInterval?: ReturnType<typeof setInterval>;

  private readonly _chartService = inject(ChartService);
  private readonly _userSymbolsService = inject(UserSymbolsService);
  private readonly tickerService = inject(BinanceTickerService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  ngOnInit(): void {
    this._chartService.getExchanges().subscribe({
      next: (exchanges) => {
        if (!exchanges?.length) {
          this.loading = false;
          this.cdr.markForCheck();
          return;
        }
        this.exchangeFilters = exchanges.map((ex) => ({ id: ex.Id, name: ex.Name }));
        // Load user symbols for ALL exchanges to build the added-state map
        forkJoin(
          exchanges.map((ex) =>
            this._userSymbolsService.getUserSymbolsForExchange(ex.Id).pipe(
              catchError(() => of([] as UserSymbol[])),
            ),
          ),
        ).subscribe({
          next: (results) => {
            for (let i = 0; i < exchanges.length; i++) {
              for (const us of results[i] ?? []) {
                this.userSymbolMap.set(`${exchanges[i].Id}:${us.SymbolId}`, us.Id);
              }
            }
            this.loadAllSymbols(exchanges.map((ex) => ({ id: ex.Id, name: ex.Name })));
          },
          error: () => this.loadAllSymbols(exchanges.map((ex) => ({ id: ex.Id, name: ex.Name }))),
        });
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
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

  private loadAllSymbols(exchanges: Array<{ id: number; name: string }>): void {
    forkJoin(
      exchanges.map((ex) =>
        this._chartService.getSymbolsForExchange(ex.id).pipe(
          catchError(() => of([] as SymbolModel[])),
        ),
      ),
    ).subscribe({
      next: (results) => {
        const vms: SymbolVM[] = [];
        for (let i = 0; i < exchanges.length; i++) {
          const ex = exchanges[i];
          for (const s of results[i] ?? []) {
            const key = `${ex.id}:${s.Id}`;
            vms.push({
              id: s.Id,
              exchangeId: ex.id,
              exchangeName: ex.name,
              name: s.SymbolName,
              icon: this.resolveIconUrl(s.SymbolName, s.Icon),
              isAdded: this.userSymbolMap.has(key),
              adding: false,
              removing: false,
              userSymbolId: this.userSymbolMap.get(key),
            });
          }
        }
        this.allSymbols = vms;
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
    const symbols = this.allSymbols.map(s => s.name).filter(s => !!s);
    this.tickerSub = this.tickerService.connect(symbols).subscribe();
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

  selectExchange(exchangeId: number | 'all'): void {
    if (this.selectedExchangeId === exchangeId) return;
    this.selectedExchangeId = exchangeId;
    this.applyFilter();
  }

  private applyFilter(): void {
    const q = (this.searchQuery || '').trim().toLowerCase();
    let base = this.allSymbols;
    if (this.selectedExchangeId !== 'all') {
      base = base.filter((s) => s.exchangeId === this.selectedExchangeId);
    }

    if (!q) {
      this.filteredSymbols = [...base];
    } else {
      this.filteredSymbols = base.filter(s =>
        s.name.toLowerCase().includes(q)
      );
    }
    this.filteredSymbols.sort((a, b) =>
      (Number(b.isAdded) - Number(a.isAdded)) || a.name.localeCompare(b.name)
    );
    this.applyTickerData();
    this.cdr.markForCheck();
  }

  countByExchange(exchangeId: number | 'all'): number {
    if (exchangeId === 'all') return this.allSymbols.length;
    return this.allSymbols.filter((s) => s.exchangeId === exchangeId).length;
  }

  isProtected(name: string): boolean {
    const n = (name || '').toUpperCase();
    return n === 'BTCUSDT' || n.includes('DOMINANCE');
  }

  onRowClick(vm: SymbolVM): void {
    if (vm.adding || vm.removing) return;

    if (vm.isAdded) {
      // Toggle OFF: remove from user profile
      if (this.isProtected(vm.name)) return;
      const userSymbolId = vm.userSymbolId;
      if (!userSymbolId) return;
      vm.removing = true;
      this.cdr.markForCheck();
      this._userSymbolsService.deleteUserSymbol(userSymbolId).subscribe({
        next: () => {
          vm.isAdded = false;
          vm.removing = false;
          vm.userSymbolId = undefined;
          this.userSymbolMap.delete(`${vm.exchangeId}:${vm.id}`);
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
      this._userSymbolsService.addUserSymbolWithExchange(vm.id, vm.exchangeId).subscribe({
        next: (created) => {
          vm.isAdded = true;
          vm.adding = false;
          vm.userSymbolId = created?.Id;
          this.userSymbolMap.set(`${vm.exchangeId}:${vm.id}`, created?.Id);
          this.router.navigate(['/watchlist']);
        },
        error: () => {
          vm.adding = false;
          this.cdr.markForCheck();
        },
      });
    }
  }

  trackBySymbol(_index: number, vm: SymbolVM): string {
    return `${vm.exchangeId}:${vm.id}`;
  }
}
