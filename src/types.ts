export interface Player {
  id: string;
  name: string;
  buyIns: number;
  totalCashOuts: number; // Sum of chips taken during intermediate cash-outs
  remainingChips: number | null; // Current chips on table (null if cashed out)
  isSettled: boolean; // true if currently cashed out
  isPermanent: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  playerId: string;
  playerName: string;
  type: 'buy-in' | 'cash-out' | 'rejoin' | 'add-player' | 'remove-player';
  amount?: number;
  prevBuyIns?: number;
  prevTotalCashOuts?: number;
  prevIsSettled?: boolean;
}

export interface GameSettings {
  gameName: string;
  chipsPerHand: number | null;
  handValueUSD: number | null;
  usdToCnyRate: number | null;
  exchangeRateMode: 'manual' | 'preset' | 'realtime';
  isBuddhaMode: boolean;
  buddhaThreshold: number | null;
}

export interface SettlementRecord {
  id: string;
  gameName: string;
  date: string;
  players: Player[];
  settings: GameSettings;
  transfers: Transfer[];
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface PlayerStats {
  name: string;
  totalProfit: number;
  gamesPlayed: number;
  maxWin: number;
  maxLoss: number;
}
