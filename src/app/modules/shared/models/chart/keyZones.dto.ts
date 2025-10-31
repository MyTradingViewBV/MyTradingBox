import { FibLevel } from './fibLevel.dto';
import { VolumeProfile } from './volumeProfile.dto';

export interface KeyZonesModel {
  Symbol: string;
  VolumeProfiles?: VolumeProfile[];
  FibLevels?: FibLevel[];
}
