import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { Location, CommonModule } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChartService } from '../../../modules/shared/services/http/chart.service';
import { UserSymbolsService } from '../../../modules/shared/services/http/user-symbols.service';
import { SymbolModel } from '../../../modules/shared/models/chart/symbol.dto';
import { UserSymbol } from '../../../modules/shared/models/userSymbols/user-symbol.dto';

interface SymbolVM {
  id: number;
  name: string;
  icon?: string;
  isAdded: boolean;
  adding: boolean;
}

@Component({
  selector: 'app-add-symbol',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-symbol.component.html',
  styleUrl: './add-symbol.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSymbolComponent implements OnInit {
  searchQuery = '';
  loading = true;

  allSymbols: SymbolVM[] = [];
  filteredSymbols: SymbolVM[] = [];

  private userSymbolIds = new Set<number>();

  private readonly _chartService = inject(ChartService);
  private readonly _userSymbolsService = inject(UserSymbolsService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    // Load user symbols and all symbols in parallel
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
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
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
    // Sort: added first, then alphabetical
    this.filteredSymbols.sort((a, b) =>
      (Number(b.isAdded) - Number(a.isAdded)) || a.name.localeCompare(b.name)
    );
    this.cdr.markForCheck();
  }

  addSymbol(vm: SymbolVM): void {
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

  removeSymbol(vm: SymbolVM): void {
    if (!vm.isAdded) return;
    // Need the UserSymbol ID to delete — refetch user symbols to find it
    this._userSymbolsService.getUserSymbols().subscribe({
      next: (userSymbols) => {
        const found = (userSymbols ?? []).find(us => us.SymbolId === vm.id);
        if (!found) return;
        this._userSymbolsService.deleteUserSymbol(found.Id).subscribe({
          next: () => {
            vm.isAdded = false;
            this.userSymbolIds.delete(vm.id);
            this.cdr.markForCheck();
          },
        });
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
