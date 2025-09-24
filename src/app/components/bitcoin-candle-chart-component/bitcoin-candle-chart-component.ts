// /* eslint-disable @typescript-eslint/no-explicit-any */
// import {
//   Component,
//   OnInit,
//   ViewChild,
//   AfterViewInit,
//   ElementRef,
// } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { NgChartsModule, BaseChartDirective } from 'ng2-charts';
// import { MatFormFieldModule } from '@angular/material/form-field';
// import { MatSelectModule } from '@angular/material/select';
// import { MatButtonToggleModule } from '@angular/material/button-toggle';
// import { MatCheckboxModule } from '@angular/material/checkbox';
// import { MatButtonModule } from '@angular/material/button';
// import { Chart } from 'chart.js';
// import 'chartjs-chart-financial';
// import 'chartjs-adapter-date-fns';

// import {
//   SymbolModel,
//   Candle,
//   FibLevel,
//   EmaMmaLevel,
//   VolumeProfile,
// } from '../../modules/shared/http/market.service';

// import {
//   CandlestickController,
//   CandlestickElement,
// } from 'chartjs-chart-financial';
// import { BitcoinCandleChartService } from '../../modules/shared/http/bitcoinCandleChartService';

// Chart.register(CandlestickController, CandlestickElement);

// @Component({
//   selector: 'app-bitcoin-candle-chart',
//   standalone: true,
//   imports: [
//     CommonModule,
//     NgChartsModule,
//     MatFormFieldModule,
//     MatSelectModule,
//     MatButtonToggleModule,
//     MatCheckboxModule,
//     MatButtonModule,
//   ],
//   templateUrl: 'bitcoin-candle-chart-component.html',
// })
// export class BitcoinCandleChartComponent implements OnInit, AfterViewInit {
//   @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

//   availableTimeframes = ['30m', '1h', '4h', '1d', '1w', '1y'];
//   selectedTimeframe = '1d';
//   symbols: SymbolModel[] = [];
//   selectedSymbol = 'BTCUSDT';

//   // overlay toggles
//   showFib = false;
//   showVolumeProfile = false;
//   showEmaMma = false;
//   showVwap = false;
//   showBoxes = true;
//   showZeros = false;

//   // cached overlay data (fetched once via service)
//   fibLevels: FibLevel[] = [];
//   emaMmaLevels: EmaMmaLevel[] = [];
//   volumeProfiles: VolumeProfile[] = [];
//   boxes: any[] = [];

//   chartData: any = { datasets: [] };
//   chartOptions: any = {
//     responsive: true,
//     maintainAspectRatio: false,
//     plugins: { legend: { display: true } },
//     scales: {
//       x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM dd' } },
//       y: { beginAtZero: false },
//     },
//   };

//   private mainDatasetCount = 1;
//   private annotationRegistered = false;

//   constructor(
//     private chartService: BitcoinCandleChartService,
//     private el: ElementRef,
//   ) {}

//   async ngAfterViewInit(): Promise<void> {
//     try {
//       const mod = await import('chartjs-plugin-zoom');
//       Chart.register((mod && (mod.default || mod)) as any);
//     } catch {
//       // ignore if not installed
//     }

//     // set --header-height CSS var dynamically
//     try {
//       const hostEl = this.el?.nativeElement as HTMLElement | undefined;
//       if (hostEl) {
//         const header = hostEl.querySelector('.controls') as HTMLElement | null;
//         const headerHeight = header ? Math.ceil(header.offsetHeight) : 72;
//         hostEl.style.setProperty('--header-height', `${headerHeight}px`);
//       }
//     } catch {}
//   }

//   ngOnInit(): void {
//     this.loadSymbols();
//     this.loadCandles();
//   }

//   resetZoom(): void {
//     try {
//       (this.chart?.chart as any)?.resetZoom?.();
//       this.chart?.update();
//     } catch {}
//   }

//   loadSymbols(): void {
//     this.chartService.getSymbols().subscribe((arr) => {
//       this.symbols = arr;
//       if (arr.length && !this.selectedSymbol) {
//         this.selectedSymbol = arr[0].SymbolName;
//       }
//     });
//   }

//   loadCandles(limit = 250): void {
//     if (!this.selectedSymbol) return;
//     this.chartService
//       .getCandles(this.selectedSymbol, this.selectedTimeframe, limit)
//       .subscribe((candles) => {
//         this.mapCandlesToChartData(candles);
//         this.ensureOverlaysLoaded();
//       });
//   }

//   onSymbolChange(symbol: string): void {
//     this.selectedSymbol = symbol;
//     this.loadCandles();
//   }

//   onTimeframeChange(tf: string): void {
//     this.selectedTimeframe = tf;
//     this.loadCandles();
//   }

//   toggleFib(checked: boolean): void {
//     this.showFib = checked;
//     this.ensureOverlaysLoaded();
//   }

//   toggleEmaMma(checked: boolean): void {
//     this.showEmaMma = checked;
//     this.ensureOverlaysLoaded();
//   }

//   toggleVolumeProfile(checked: boolean): void {
//     this.showVolumeProfile = checked;
//     this.ensureOverlaysLoaded();
//   }

//   toggleBoxes(checked: boolean): void {
//     this.showBoxes = checked;
//     this.ensureOverlaysLoaded();
//   }

//   toggleShowZeros(checked: boolean): void {
//     this.showZeros = checked;
//     this.refreshOverlays();
//   }

//   private ensureOverlaysLoaded(): void {
//     if (this.showFib) {
//       this.chartService
//         .getFibLevels(this.selectedSymbol, this.selectedTimeframe)
//         .subscribe((arr) => {
//           this.fibLevels = arr;
//           this.refreshOverlays();
//         });
//     }
//     if (this.showEmaMma || this.showVwap) {
//       this.chartService
//         .getEmaMmaLevels(this.selectedSymbol, this.selectedTimeframe)
//         .subscribe((arr) => {
//           this.emaMmaLevels = arr;
//           this.refreshOverlays();
//         });
//     }
//     if (this.showVolumeProfile) {
//       this.chartService
//         .getVolumeProfiles(this.selectedSymbol, this.selectedTimeframe)
//         .subscribe((arr) => {
//           this.volumeProfiles = arr;
//           this.refreshOverlays();
//         });
//     }
//     if (this.showBoxes) {
//       this.chartService.getBoxes(this.selectedSymbol).subscribe((arr) => {
//         this.boxes = arr.filter(
//           (b: any) => ((b.Type || b.type || '') + '').toLowerCase() === 'range',
//         );
//         this.refreshOverlays();
//       });
//     }
//   }

//   private refreshOverlays(): void {
//     this.chartData.datasets = this.chartData.datasets.slice(
//       0,
//       this.mainDatasetCount,
//     );

//     if (this.showFib && this.fibLevels.length) this.addFibDatasets();
//     if ((this.showEmaMma || this.showVwap) && this.emaMmaLevels.length)
//       this.addEmaMmaDatasets();
//     if (this.showVolumeProfile && this.volumeProfiles.length)
//       this.addVolumeProfileDatasets();

//     this.chartData = {
//       datasets: [...(this.chartData.datasets as any[])],
//     };
//     this.resetZoom();
//   }

//   private addFibDatasets(): void {
//     const overlays = (this.fibLevels || [])
//       .filter((f) => this.showZeros || Number(f.Price) !== 0)
//       .map((f) => ({
//         type: 'line' as const,
//         label: `Fib ${f.Level}`,
//         data: this.horizontalLineData(f.Price),
//         borderColor: 'rgba(255,165,0,0.9)',
//         borderWidth: 1,
//         borderDash: [6, 4],
//         pointRadius: 0,
//         tension: 0,
//       }));
//     this.chartData.datasets.push(...overlays);
//   }

//   private addEmaMmaDatasets(): void {
//     const vwapTypes = ['VWAP', 'RVWAP'];
//     let items = this.emaMmaLevels || [];
//     if (this.showVwap) {
//       items = items.filter((e) =>
//         vwapTypes.includes((e.Type || '').toUpperCase()),
//       );
//     } else if (this.showEmaMma) {
//       items = items.filter(
//         (e) => !vwapTypes.includes((e.Type || '').toUpperCase()),
//       );
//     } else {
//       items = [];
//     }

//     const overlays = items
//       .filter((e) => this.showZeros || Number(e.Value) !== 0)
//       .map((e) => ({
//         type: 'line' as const,
//         label: `${e.Type} ${e.Period ?? ''}`,
//         data: this.horizontalLineData(e.Value),
//         borderColor: 'rgba(0,128,255,0.9)',
//         borderWidth: 1,
//         pointRadius: 0,
//         tension: 0,
//       }));
//     this.chartData.datasets.push(...overlays);
//   }

//   private addVolumeProfileDatasets(): void {
//     const overlays: any[] = [];
//     (this.volumeProfiles || [])
//       .filter(
//         (v) =>
//           this.showZeros ||
//           Number(v.Poc) !== 0 ||
//           Number(v.Vah) !== 0 ||
//           Number(v.Val) !== 0,
//       )
//       .forEach((v) => {
//         if (this.showZeros || Number(v.Poc) !== 0) {
//           overlays.push({
//             type: 'line' as const,
//             label: 'POC',
//             data: this.horizontalLineData(v.Poc),
//             borderColor: 'rgba(0,200,0,0.9)',
//             borderWidth: 1,
//             pointRadius: 0,
//           });
//         }
//         if (this.showZeros || Number(v.Vah) !== 0) {
//           overlays.push({
//             type: 'line' as const,
//             label: 'VAH',
//             data: this.horizontalLineData(v.Vah),
//             borderColor: 'rgba(200,0,200,0.9)',
//             borderWidth: 1,
//             pointRadius: 0,
//           });
//         }
//         if (this.showZeros || Number(v.Val) !== 0) {
//           overlays.push({
//             type: 'line' as const,
//             label: 'VAL',
//             data: this.horizontalLineData(v.Val),
//             borderColor: 'rgba(200,200,0,0.9)',
//             borderWidth: 1,
//             pointRadius: 0,
//           });
//         }
//       });

//     this.chartData.datasets.push(...overlays);
//   }

//   private horizontalLineData(price: number): Array<{ x: number; y: number }> {
//     const candleDs = this.chartData.datasets[0]?.data as
//       | Array<{ x: number }>
//       | undefined;
//     if (candleDs && candleDs.length >= 2) {
//       const x0 = candleDs[0].x;
//       const x1 = candleDs[candleDs.length - 1].x;
//       return [
//         { x: x0, y: price },
//         { x: x1, y: price },
//       ];
//     }
//     return [
//       { x: new Date().getTime() - 3600 * 1000, y: price },
//       { x: new Date().getTime(), y: price },
//     ];
//   }

//   private mapCandlesToChartData(candles: Candle[]): void {
//     const ds = (candles || []).map((c) => ({
//       x: new Date(c.Time).getTime(),
//       o: c.Open,
//       h: c.High,
//       l: c.Low,
//       c: c.Close,
//     }));
//     this.chartData = {
//       datasets: [
//         { label: `${this.selectedSymbol} ${this.selectedTimeframe}`, data: ds },
//       ],
//     };
//     this.mainDatasetCount = this.chartData.datasets.length;
//   }
// }
