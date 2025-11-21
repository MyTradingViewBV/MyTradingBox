import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

interface BalanceItem {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  icon: string; // lucide name placeholder
}
interface PnlItem {
  label: string;
  value: string;
  change: string;
  positive: boolean;
}
interface TxItem {
  type: 'buy' | 'sell';
  pair: string;
  amount: string;
  value: string;
  time: string;
}

@Component({
  selector: 'app-balance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './balance.component.html',
  styleUrl: './balance.component.scss'
})
export class BalanceComponent {
  balanceData: BalanceItem[] = [
    { label: 'Total Balance', value: '$10,033.03', change: '+22.04%', positive: true, icon: 'wallet' },
    { label: 'Available', value: '$8,220.94', change: '+18.5%', positive: true, icon: 'dollar' },
    { label: 'In Orders', value: '$1,812.09', change: '', positive: true, icon: 'pie' }
  ];

  pnlData: PnlItem[] = [
    { label: 'Unrealized P/L', value: '$126.76', change: '+2.34%', positive: true },
    { label: 'Realized P/L', value: '-$110.10', change: '-1.52%', positive: false }
  ];

  recentTransactions: TxItem[] = [
    { type: 'buy', pair: 'BTC-EUR', amount: '+0.0234 BTC', value: '$845.32', time: '2h ago' },
    { type: 'sell', pair: 'ETH-EUR', amount: '-1.5 ETH', value: '$3,241.50', time: '5h ago' },
    { type: 'buy', pair: 'HBAR-EUR', amount: '+5000 HBAR', value: '$245.00', time: '1d ago' },
    { type: 'buy', pair: 'SOL-EUR', amount: '+12.5 SOL', value: '$1,230.62', time: '2d ago' }
  ];

  trackIndex(_: number, item: unknown): unknown { return item; }
}
