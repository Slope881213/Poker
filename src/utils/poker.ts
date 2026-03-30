import { Player, Transfer, GameSettings } from '../types';

/**
 * Debt simplification algorithm (Greedy approach)
 * Calculates the minimum number of transfers to settle all debts.
 */
export function calculateTransfers(players: Player[], settings: GameSettings): Transfer[] {
  const chipsPerHand = settings.chipsPerHand || 0;
  const handValueUSD = settings.handValueUSD || 0;
  const isBuddhaMode = settings.isBuddhaMode;
  const buddhaThreshold = settings.buddhaThreshold || 0;
  
  // 1. Calculate net profit for each player in hands
  let balances = players.map(p => {
    const totalInput = p.buyIns * chipsPerHand;
    const remaining = p.remainingChips === null ? totalInput : p.remainingChips; // Default to break-even if null
    let net = remaining - totalInput;
    
    // Buddha mode logic: if absolute profit is less than threshold, set to 0
    if (isBuddhaMode && Math.abs(net) < buddhaThreshold) {
      net = 0;
    }
    
    return {
      name: p.name,
      balance: net
    };
  });

  // 2. Adjust balances if Buddha mode caused a discrepancy
  const totalImbalance = balances.reduce((sum, b) => sum + b.balance, 0);
  if (totalImbalance !== 0) {
    // Find players who were NOT zeroed out by Buddha mode
    const activePlayers = balances.filter(b => Math.abs(b.balance) > 0.01);
    if (activePlayers.length > 0) {
      const adjustmentPerPlayer = totalImbalance / activePlayers.length;
      balances = balances.map(b => {
        if (Math.abs(b.balance) > 0.01) {
          return { ...b, balance: b.balance - adjustmentPerPlayer };
        }
        return b;
      });
    }
  }

  // 3. Separate into creditors and debtors
  let creditors = balances.filter(b => b.balance > 0.01).sort((a, b) => b.balance - a.balance);
  let debtors = balances.filter(b => b.balance < -0.01).sort((a, b) => a.balance - b.balance);

  const transfers: Transfer[] = [];

  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    
    const amount = Math.min(-debtor.balance, creditor.balance);
    
    if (amount > 0.01) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        amount: amount / chipsPerHand * handValueUSD // Convert hands to USD
      });
    }

    debtor.balance += amount;
    creditor.balance -= amount;

    if (Math.abs(debtor.balance) < 0.01) i++;
    if (Math.abs(creditor.balance) < 0.01) j++;
  }

  return transfers;
}

export function formatCurrency(amount: number, rate: number | null): string {
  const usd = amount.toFixed(2);
  const cny = (amount * (rate || 0)).toFixed(2);
  return `$${usd} / ¥${cny}`;
}
