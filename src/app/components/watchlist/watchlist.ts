import { Component, OnInit } from '@angular/core';
import { WatchlistDTO } from '../../modules/shared/models/watchlist.dto';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MarketService } from '../../modules/shared/http/market.service';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

@Component({
  selector: 'app-watchlist',
  imports: [
    CommonModule,
    MatCardModule,
    MatButton,
    MatChipsModule,
    MatIconModule,
  ],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
})
export class WatchlistComponent implements OnInit {
  watchlist: WatchlistDTO[] = [];

  constructor(
    private _marketService: MarketService,
    private _snackbar: MatSnackBar,
    private router: Router,
  ) {}

  get btcDivItems(): WatchlistDTO[] {
    return this.watchlist?.filter((i) => i.Status === 'BTC-DIV') ?? [];
  }

  get otherItems(): WatchlistDTO[] {
    return this.watchlist?.filter((i) => i.Status !== 'BTC-DIV') ?? [];
  }

  ngOnInit(): void {
    this._marketService.getWatchlist().subscribe((data) => {
      this.watchlist = data;
      console.log('watchlist fetched:', this.watchlist);
    });
  }

  goToChart(symbol: string, timeframe: string): void {
    this.router.navigate(['/chartTest', symbol, timeframe]); // 👈 send both
  }

  refresh(): void {
    this._marketService.getWatchlist().subscribe((data) => {
      this.watchlist = data;
      console.log('watchlist refreshed:', this.watchlist);
      this._snackbar.open('watchlist refreshed', 'Close', { duration: 2000 });
    });
  }

  back(): void {
    window.history.back();
  }

  remove(item: WatchlistDTO): void {
    //this._marketService.removeFromWatchlist(item.Id).subscribe(() => {
    //  this.watchlist = this.watchlist.filter(w => w.Id !== item.Id);
    this._snackbar.open(`Removed ${item.Symbol} from watchlist`, 'Close', {
      duration: 2000,
    });
    //});
  }
}
