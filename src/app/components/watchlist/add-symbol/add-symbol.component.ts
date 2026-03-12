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

  private userSymbolIds = new Set<number>();
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
          this.userSymbolIds.add(us.SymbolId);
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

  private loadAllSymbols(): void {
    this._chartService.getSymbols().subscribe({
      next: (symbols) => {
        this.allSymbols = (symbols ?? []).map(s => ({
          id: s.Id,
          name: s.SymbolName,
          icon: s.Icon ? `data:image/png;base64,${s.Icon}` : undefined,
          isAdded: this.userSymbolIds.has(s.Id),
          adding: false,
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
    if (vm.isAdded || vm.adding) return;
    vm.adding = true;
    this.cdr.markForCheck();

    this._userSymbolsService.addUserSymbol(vm.id).subscribe({
      next: () => {
        vm.isAdded = true;
        vm.adding = false;
        this.userSymbolIds.add(vm.id);
        this.cdr.markForCheck();
      },
      error: () => {
        vm.adding = false;
        this.cdr.markForCheck();
      },
    });
  }

  goBack(): void {
    this.location.back();
  }

  trackBySymbol(_index: number, vm: SymbolVM): number {
    return vm.id;
  }
}
