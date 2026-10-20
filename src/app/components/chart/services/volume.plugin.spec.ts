import { formatVolume, volumeBaseAsset } from './volume.plugin';

describe('volume plugin helpers', () => {
  it('derives the base asset from the symbol name', () => {
    expect(volumeBaseAsset('BTCUSDT')).toBe('BTC');
    expect(volumeBaseAsset('BTC-EUR')).toBe('BTC');
    expect(volumeBaseAsset('ETH/USD')).toBe('ETH');
    expect(volumeBaseAsset('SOLUSDT.P')).toBe('SOL');
    expect(volumeBaseAsset('ETHBTC')).toBe('ETH');
    expect(volumeBaseAsset('')).toBe('');
  });

  it('formats volume like TradingView', () => {
    expect(formatVolume(1960)).toBe('1.96K');
    expect(formatVolume(12_300_000)).toBe('12.3M');
    expect(formatVolume(4_500_000_000)).toBe('4.5B');
    expect(formatVolume(1000)).toBe('1K');
    expect(formatVolume(12.345)).toBe('12.35');
    expect(formatVolume(250)).toBe('250');
  });
});
