import { TestBed } from '@angular/core/testing';
import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';
import { MiniMcbComponent } from './mini-mcb.component';

function candles(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + Math.sin(i / 6) * 10;
    return { Symbol: 'BTCUSDT', Timeframe: '1h', Time: '', Open: close - 1, High: close + 2, Low: close - 2, Close: close, Volume: 1 };
  });
}

describe('MiniMcbComponent', () => {
  function render(list: Candle[]) {
    const fixture = TestBed.createComponent(MiniMcbComponent);
    fixture.componentRef.setInput('candles', list);
    fixture.componentRef.setInput('visible', 60);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws WaveTrend and money flow areas for the visible candles', () => {
    const el = render(candles(200));
    const paths = [...el.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '');
    expect(paths).toHaveLength(4);
    expect(paths.every((d) => d.startsWith('M'))).toBe(true);
    expect(el.querySelectorAll('circle').length).toBeGreaterThan(0);
  });

  it('shows a placeholder without candles', () => {
    const el = render([]);
    expect(el.querySelector('svg')).toBeNull();
    expect(el.querySelector('.empty')).not.toBeNull();
  });
});
