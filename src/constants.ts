import { GameSettings } from './types';

export const DEFAULT_SETTINGS: GameSettings = {
  gameName: '',
  chipsPerHand: 200,
  handValueUSD: 1,
  usdToCnyRate: 20 / 3,
  exchangeRateMode: 'preset',
  isBuddhaMode: true,
  buddhaThreshold: 100, // 0.5 hand if chipsPerHand is 200
};

export const STORAGE_KEYS = {
  SETTINGS: 'poker_nexus_settings',
  PLAYERS: 'poker_nexus_players',
  PERMANENT_PLAYERS: 'poker_nexus_permanent_players',
  HISTORY: 'poker_nexus_history',
  LOGS: 'poker_nexus_logs',
};
