import React, { useState, useEffect, useMemo } from 'react';
import { 
  Settings as SettingsIcon, 
  CreditCard, 
  Calculator, 
  Trophy, 
  Plus, 
  Minus, 
  UserPlus, 
  Trash2, 
  CheckCircle2, 
  History,
  ArrowRightLeft,
  DollarSign,
  RefreshCw,
  AlertTriangle,
  UserCheck,
  RotateCcw,
  LogOut,
  Undo2,
  UserPlus2,
  Scale,
  ChevronDown,
  ChevronUp,
  LogIn,
  Languages
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Player, GameSettings, SettlementRecord, PlayerStats, Transfer, LogEntry } from './types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants';
import { calculateTransfers, formatCurrency } from './utils/poker';
import { Language, translations } from './i18n';
import { 
  db, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  onSnapshot, 
  doc, 
  setDoc, 
  collection, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<'settings' | 'game' | 'settlement' | 'leaderboard'>('game');
  
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [players, setPlayers] = useState<Player[]>([]);
  const [permanentPlayers, setPermanentPlayers] = useState<string[]>(['Corey', 'Evan', 'Jennifer', 'David', 'BaiLi']);
  const [history, setHistory] = useState<SettlementRecord[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Language state (local to device)
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved as Language) || 'zh-TW';
  });

  const t = (key: keyof typeof translations['zh-TW'], params?: Record<string, string>) => {
    let text = translations[language][key] || translations['zh-TW'][key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    return text;
  };

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('app_language', lang);
  };

  useEffect(() => {
    // Sync active game state
    const unsubGame = onSnapshot(doc(db, 'active_game', 'current'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setPlayers(data.players || []);
        setSettings(prev => ({ ...prev, ...data.settings }));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'active_game/current'));

    // Sync history
    const unsubHistory = onSnapshot(
      query(collection(db, 'history'), orderBy('date', 'desc'), limit(50)),
      (snapshot) => {
        const h = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SettlementRecord));
        setHistory(h);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'history')
    );

    // Sync logs
    const unsubLogs = onSnapshot(
      query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(50)),
      (snapshot) => {
        const l = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as LogEntry));
        setLogs(l);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'logs')
    );

    // Sync permanent players
    const unsubPerm = onSnapshot(doc(db, 'config', 'permanent_players'), (snapshot) => {
      if (snapshot.exists()) {
        setPermanentPlayers(snapshot.data().names || []);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'config/permanent_players'));

    return () => {
      unsubGame();
      unsubHistory();
      unsubLogs();
      unsubPerm();
    };
  }, []);

  useEffect(() => {
    if (settings.exchangeRateMode === 'realtime') {
      fetch('https://open.er-api.com/v6/latest/USD')
        .then(res => res.json())
        .then(data => {
          if (data && data.rates && data.rates.CNY) {
            updateSettings({ usdToCnyRate: data.rates.CNY });
            showToast(`${t('toast.rateUpdated')}: ${data.rates.CNY.toFixed(4)}`, 'info');
          }
        })
        .catch(() => showToast(t('toast.rateError'), 'error'));
    }
  }, [settings.exchangeRateMode]);

  const updateGameState = async (newPlayers: Player[], newSettings?: Partial<GameSettings>) => {
    try {
      await setDoc(doc(db, 'active_game', 'current'), {
        players: newPlayers,
        settings: { ...settings, ...(newSettings || {}) },
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'active_game/current');
    }
  };

  const updateSettings = (newSettings: Partial<GameSettings>) => {
    updateGameState(players, newSettings);
  };

  const updatePermanentPlayers = async (names: string[]) => {
    try {
      await setDoc(doc(db, 'config', 'permanent_players'), { names });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'config/permanent_players');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

  const addLog = async (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newLog: LogEntry = {
      ...entry,
      id: generateId(),
      timestamp: Date.now()
    };
    try {
      await addDoc(collection(db, 'logs'), newLog);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'logs');
    }
  };

  const addPlayer = (name: string, isFromPermanent = false) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (players.find(p => p.name === trimmedName)) {
      showToast('玩家已在對局中', 'error');
      return;
    }

    const newPlayer: Player = {
      id: generateId(),
      name: trimmedName,
      buyIns: 1,
      totalCashOuts: 0,
      isSettled: false,
      remainingChips: null,
      isPermanent: isFromPermanent
    };

    const newPlayers = [...players, newPlayer];
    updateGameState(newPlayers);
    addLog({ playerId: newPlayer.id, playerName: newPlayer.name, type: 'add-player' });
  };

  const removePlayer = (id: string) => {
    const player = players.find(p => p.id === id);
    if (player) {
      const newPlayers = players.filter(p => p.id !== id);
      updateGameState(newPlayers);
      addLog({ playerId: id, playerName: player.name, type: 'remove-player' });
    }
  };

  const buyIn = (id: string) => {
    const player = players.find(p => p.id === id);
    if (!player) return;

    addLog({ 
      playerId: id, 
      playerName: player.name, 
      type: 'buy-in', 
      prevBuyIns: player.buyIns 
    });

    const newPlayers = players.map(p => 
      p.id === id ? { ...p, buyIns: p.buyIns + 1, isSettled: false } : p
    );
    updateGameState(newPlayers);
  };

  const cashOut = (id: string, amount: number) => {
    const player = players.find(p => p.id === id);
    if (!player) return;

    addLog({ 
      playerId: id, 
      playerName: player.name, 
      type: 'cash-out', 
      amount,
      prevTotalCashOuts: player.totalCashOuts,
      prevIsSettled: player.isSettled
    });

    const newPlayers = players.map(p => 
      p.id === id ? { 
        ...p, 
        totalCashOuts: p.totalCashOuts + amount, 
        isSettled: true,
        remainingChips: 0 // Mark as settled
      } : p
    );
    updateGameState(newPlayers);
  };

  const rejoin = (id: string) => {
    const player = players.find(p => p.id === id);
    if (!player) return;

    // Find the last cash-out log for this player to see how much they took
    const lastCashOutLog = logs.find(l => l.playerId === id && l.type === 'cash-out');
    const amountToRestore = lastCashOutLog?.amount || 0;

    addLog({ 
      playerId: id, 
      playerName: player.name, 
      type: 'rejoin',
      prevBuyIns: player.buyIns,
      prevIsSettled: player.isSettled,
      prevTotalCashOuts: player.totalCashOuts,
      amount: amountToRestore
    });

    const newPlayers = players.map(p => 
      p.id === id ? { 
        ...p, 
        isSettled: false, 
        remainingChips: null,
        totalCashOuts: Math.max(0, p.totalCashOuts - amountToRestore)
      } : p
    );
    updateGameState(newPlayers);
    showToast(t('toast.rejoin', { name: player.name, amount: amountToRestore }), 'success');
  };

  const undo = async (logId: string) => {
    const log = logs.find(l => l.id === logId);
    if (!log) return;

    if (Date.now() - log.timestamp > 5 * 60 * 1000) {
      showToast(t('toast.undoLimit'), 'error');
      return;
    }

    let newPlayers = [...players];
    if (log.type === 'add-player') {
      newPlayers = players.filter(p => p.id !== log.playerId);
    } else {
      newPlayers = players.map(p => {
        if (p.id === log.playerId) {
          if (log.type === 'buy-in') {
            return { ...p, buyIns: log.prevBuyIns ?? p.buyIns };
          }
          if (log.type === 'cash-out') {
            return { 
              ...p, 
              totalCashOuts: log.prevTotalCashOuts ?? p.totalCashOuts,
              isSettled: log.prevIsSettled ?? p.isSettled,
              remainingChips: log.prevIsSettled ? 0 : null
            };
          }
          if (log.type === 'rejoin') {
            return { 
              ...p, 
              buyIns: log.prevBuyIns ?? p.buyIns,
              totalCashOuts: log.prevTotalCashOuts ?? p.totalCashOuts,
              isSettled: log.prevIsSettled ?? p.isSettled,
              remainingChips: log.prevIsSettled ? 0 : null
            };
          }
        }
        return p;
      });
    }

    updateGameState(newPlayers);
    try {
      await deleteDoc(doc(db, 'logs', logId));
      showToast(t('toast.undoSuccess'), 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `logs/${logId}`);
    }
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const resetGame = async () => {
    try {
      const batch = writeBatch(db);
      
      // Reset active game
      batch.set(doc(db, 'active_game', 'current'), {
        players: [],
        settings: DEFAULT_SETTINGS,
        updatedAt: serverTimestamp()
      });

      // Clear logs
      const logsSnapshot = await getDocs(collection(db, 'logs'));
      logsSnapshot.docs.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      setShowResetConfirm(false);
      showToast(t('toast.resetSuccess'), 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reset');
    }
  };

  const [cashOutPlayerId, setCashOutPlayerId] = useState<string | null>(null);
  const [cashOutAmount, setCashOutAmount] = useState<string>('');

  const [isSettlementMode, setIsSettlementMode] = useState(false);
  const [endGameChips, setEndGameChips] = useState<Record<string, number>>({});

  const activePlayers = players.filter(p => !p.isSettled);
  const settledPlayers = players.filter(p => p.isSettled);

  const finalizeSettlement = () => {
    // Check if all active players have an input (even 0 is valid)
    const allPlayersInputted = activePlayers.every(p => endGameChips[p.id] !== undefined && endGameChips[p.id] !== null);
    
    if (!allPlayersInputted) {
      showToast(t('toast.inputAllChips'), 'error');
      return;
    }

    // Just switch tab, previewPlayers will handle the display
    setActiveTab('settlement');
  };

  const saveToHistory = async () => {
    if (players.length === 0) return;

    // Use previewPlayers which includes the final chip counts
    const playersForCalculation = previewPlayers.map(p => ({
      ...p,
      remainingChips: (p.remainingChips || 0) + p.totalCashOuts
    }));

    const transfers = calculateTransfers(playersForCalculation, settings);
    const now = new Date();
    const defaultName = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} 對局`;
    
    const record: SettlementRecord = {
      id: generateId(),
      gameName: (settings.gameName || '').trim() || defaultName,
      date: now.toISOString(),
      players: playersForCalculation,
      settings: { ...settings },
      transfers
    };

    try {
      const batch = writeBatch(db);
      
      // Add to history
      batch.set(doc(collection(db, 'history'), record.id), record);
      
      // Reset active game
      batch.set(doc(db, 'active_game', 'current'), {
        players: [],
        settings: DEFAULT_SETTINGS,
        updatedAt: serverTimestamp()
      });

      // Clear logs
      const logsSnapshot = await getDocs(collection(db, 'logs'));
      logsSnapshot.docs.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      
      setEndGameChips({});
      setIsSettlementMode(false);
      setActiveTab('leaderboard');
      showToast(t('toast.saveSuccess'), 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'history');
    }
  };

  const deleteHistoryRecord = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'history', id));
      setDeletingId(null);
      showToast(t('toast.deleteSuccess'), 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `history/${id}`);
    }
  };

  const clearAllHistory = async () => {
    try {
      const batch = writeBatch(db);
      const historySnapshot = await getDocs(collection(db, 'history'));
      historySnapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setIsClearingAll(false);
      showToast(t('toast.clearSuccess'), 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'history');
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const previewPlayers = useMemo(() => {
    return players.map(p => {
      if (p.isSettled) return p;
      // If we are in settlement mode and have an input, use it for preview
      if (isSettlementMode && endGameChips[p.id] !== undefined) {
        return { ...p, remainingChips: endGameChips[p.id], isSettled: true };
      }
      return p;
    });
  }, [players, isSettlementMode, endGameChips]);

  const stats = useMemo(() => {
    const playerStats: Record<string, PlayerStats> = {};
    history.forEach(record => {
      record.players.forEach(p => {
        if (!playerStats[p.name]) {
          playerStats[p.name] = { name: p.name, totalProfit: 0, gamesPlayed: 0, maxWin: 0, maxLoss: 0 };
        }
        // Profit should include both remaining chips and any intermediate cash outs
        const totalReturned = (p.remainingChips || 0) + (p.totalCashOuts || 0);
        const profit = (totalReturned - (p.buyIns * (record.settings.chipsPerHand || 0))) / (record.settings.chipsPerHand || 1) * (record.settings.handValueUSD || 0);
        
        playerStats[p.name].totalProfit += profit;
        playerStats[p.name].gamesPlayed += 1;
        playerStats[p.name].maxWin = Math.max(playerStats[p.name].maxWin, profit);
        playerStats[p.name].maxLoss = Math.min(playerStats[p.name].maxLoss, profit);
      });
    });
    return Object.values(playerStats).sort((a, b) => b.totalProfit - a.totalProfit);
  }, [history]);

  const totalBuyInChips = useMemo(() => 
    previewPlayers.reduce((sum, p) => sum + p.buyIns * (settings.chipsPerHand || 0), 0),
    [previewPlayers, settings.chipsPerHand]
  );
  
  const totalRemainingChips = useMemo(() => 
    previewPlayers.reduce((sum, p) => sum + (p.remainingChips || 0) + p.totalCashOuts, 0),
    [previewPlayers]
  );

  const isBalanced = totalBuyInChips === totalRemainingChips;

  return (
    <div className="min-h-screen bg-background text-white font-sans pb-24">
      <header className="p-6 flex items-center justify-between glass sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Calculator className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">{t('header.title')} <span className="text-primary">Nexus</span></h1>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold">{t('header.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`p-2 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-white/5 text-white/40'}`}
          >
            <SettingsIcon className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <section className="glass-card p-6 rounded-2xl space-y-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <SettingsIcon size={20} className="text-primary" />
                  {t('settings.basic')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold opacity-40 uppercase tracking-widest">{t('settings.chipsPerHand')}</label>
                    <input 
                      type="number" 
                      value={settings.chipsPerHand}
                      onChange={e => updateSettings({ chipsPerHand: Number(e.target.value) })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold opacity-40 uppercase tracking-widest">{t('settings.handValue')}</label>
                    <input 
                      type="number" 
                      value={settings.handValueUSD}
                      onChange={e => updateSettings({ handValueUSD: Number(e.target.value) })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold opacity-40 uppercase tracking-widest">{t('settings.exchangeRate')}</label>
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        value={settings.usdToCnyRate || ''}
                        disabled={settings.exchangeRateMode === 'realtime'}
                        onChange={e => updateSettings({ usdToCnyRate: Number(e.target.value) })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-primary disabled:opacity-50"
                      />
                      <button 
                        onClick={() => updateSettings({ usdToCnyRate: 20 / 3 })}
                        className="px-3 bg-white/5 border border-white/10 rounded-xl hover:bg-primary/20 transition-all text-[10px] font-bold"
                        title="設為 3USD = 20RMB"
                      >
                        20/3
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="glass-card p-6 rounded-2xl space-y-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <RefreshCw size={20} className="text-primary" />
                  {t('settings.rateMode')}
                </h2>
                <div className="flex gap-4">
                  <button 
                    onClick={() => updateSettings({ exchangeRateMode: 'manual' })}
                    className={`flex-1 p-3 rounded-xl border transition-all ${settings.exchangeRateMode !== 'realtime' ? 'bg-primary border-primary text-white' : 'bg-white/5 border-white/10 text-white/60'}`}
                  >
                    {t('settings.manual')}
                  </button>
                  <button 
                    onClick={() => updateSettings({ exchangeRateMode: 'realtime' })}
                    className={`flex-1 p-3 rounded-xl border transition-all ${settings.exchangeRateMode === 'realtime' ? 'bg-primary border-primary text-white' : 'bg-white/5 border-white/10 text-white/60'}`}
                  >
                    {t('settings.realtime')}
                  </button>
                </div>
                {settings.exchangeRateMode === 'realtime' && (
                  <p className="text-[10px] opacity-40 italic">{t('settings.realtimeHint')}</p>
                )}
              </section>

              <section className="glass-card p-6 rounded-2xl space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Trophy size={20} className="text-primary" />
                    {t('settings.buddhaMode')}
                  </h2>
                  <button 
                    onClick={() => updateSettings({ isBuddhaMode: !settings.isBuddhaMode })}
                    className={`w-12 h-6 rounded-full transition-all relative ${settings.isBuddhaMode ? 'bg-primary' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.isBuddhaMode ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
                {settings.isBuddhaMode && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold opacity-40 uppercase tracking-widest">{t('settings.buddhaThreshold')}</label>
                    <input 
                      type="number" 
                      value={settings.buddhaThreshold || ''}
                      onChange={e => updateSettings({ buddhaThreshold: Number(e.target.value) })}
                      placeholder="例如: 100"
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-primary"
                    />
                    <p className="text-[10px] opacity-40 italic">{t('settings.buddhaHint')}</p>
                  </div>
                )}
              </section>

              <section className="glass-card p-6 rounded-2xl space-y-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <UserPlus size={20} className="text-primary" />
                  {t('settings.permanentPlayers')}
                </h2>
                <div className="flex gap-2">
                  <input 
                    id="perm-player-input"
                    type="text" 
                    placeholder={t('game.playerName') + "..."}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-primary"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val && !permanentPlayers.includes(val)) {
                          updatePermanentPlayers([...permanentPlayers, val]);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      const input = document.getElementById('perm-player-input') as HTMLInputElement;
                      const val = input.value.trim();
                      if (val && !permanentPlayers.includes(val)) {
                        updatePermanentPlayers([...permanentPlayers, val]);
                        input.value = '';
                      }
                    }}
                    className="bg-primary px-4 rounded-xl"
                  >
                    {t('game.add')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {permanentPlayers.map(name => (
                    <div key={name} className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg border border-white/5">
                      <span>{name}</span>
                      <button 
                        onClick={() => updatePermanentPlayers(permanentPlayers.filter(n => n !== name))}
                        className="text-danger opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="glass-card p-6 rounded-2xl space-y-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Languages size={20} className="text-primary" />
                  {t('settings.language')}
                </h2>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => changeLanguage('zh-TW')}
                    className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between ${language === 'zh-TW' ? 'bg-primary border-primary text-white' : 'bg-white/5 border-white/10 text-white/60'}`}
                  >
                    <span className="font-bold">繁體中文</span>
                    {language === 'zh-TW' && <CheckCircle2 size={18} />}
                  </button>
                  <button 
                    onClick={() => changeLanguage('zh-CN')}
                    className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between ${language === 'zh-CN' ? 'bg-primary border-primary text-white' : 'bg-white/5 border-white/10 text-white/60'}`}
                  >
                    <span className="font-bold">简体中文</span>
                    {language === 'zh-CN' && <CheckCircle2 size={18} />}
                  </button>
                  <button 
                    onClick={() => changeLanguage('en')}
                    className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between ${language === 'en' ? 'bg-primary border-primary text-white' : 'bg-white/5 border-white/10 text-white/60'}`}
                  >
                    <span className="font-bold">English</span>
                    {language === 'en' && <CheckCircle2 size={18} />}
                  </button>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'game' && (
            <motion.div
              key="game"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 mr-4">
                  <input 
                    type="text" 
                    value={settings.gameName || ''}
                    onChange={e => setSettings({ ...settings, gameName: e.target.value })}
                    placeholder={t('game.namePlaceholder')}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-primary text-sm font-medium"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsSettlementMode(!isSettlementMode)}
                    disabled={players.length === 0}
                    className={`px-4 py-2 rounded-xl font-bold text-sm shadow-lg transition-all disabled:opacity-50 disabled:shadow-none ${
                      isSettlementMode 
                        ? 'bg-white/10 text-white hover:bg-white/20' 
                        : 'bg-danger text-white shadow-danger/20 hover:bg-danger/80'
                    }`}
                  >
                    {isSettlementMode ? t('settle.back') : t('game.reset')}
                  </button>
                  {!isSettlementMode && (
                    <button 
                      onClick={() => setShowResetConfirm(true)}
                      className="p-2 bg-white/5 rounded-xl text-white/40 hover:text-danger hover:bg-danger/10 transition-all"
                      title={t('game.reset')}
                    >
                      <RefreshCw size={20} />
                    </button>
                  )}
                </div>
              </div>

              {!isSettlementMode && (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      id="new-player-input"
                      type="text" 
                      placeholder={t('game.playerName') + " ➜ " + t('game.add')}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pl-12 outline-none focus:border-primary glass text-lg font-medium"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addPlayer(e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    <UserPlus2 className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={24} />
                  </div>
                  <button 
                    onClick={() => {
                      const input = document.getElementById('new-player-input') as HTMLInputElement;
                      addPlayer(input.value);
                      input.value = '';
                    }}
                    className="bg-primary text-white px-6 rounded-2xl hover:bg-primary/80 transition-all shadow-lg shadow-primary/20 flex items-center justify-center"
                  >
                    <Plus size={28} />
                  </button>
                </div>
              )}

              {!isSettlementMode && permanentPlayers.filter(name => !players.some(p => p.name === name)).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <span className="w-full text-[10px] font-bold opacity-40 uppercase tracking-widest px-2 mb-1">{t('settings.permanentPlayers')}</span>
                  {permanentPlayers
                    .filter(name => !players.some(p => p.name === name))
                    .map(name => (
                      <button 
                        key={name}
                        onClick={() => addPlayer(name, true)}
                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-full hover:bg-primary/20 hover:border-primary/50 transition-all text-xs font-medium text-white/60 hover:text-white"
                      >
                        + {name}
                      </button>
                    ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AnimatePresence>
                  {activePlayers.map(player => (
                    <motion.div
                      key={player.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={`glass-card rounded-3xl p-6 flex flex-col gap-4 border border-white/10 relative overflow-hidden group transition-all ${
                        isSettlementMode ? 'ring-2 ring-primary/50' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-2xl font-bold mb-1">{player.name}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono opacity-50 uppercase tracking-wider">
                              {isSettlementMode ? t('game.cashOut') : t('game.buyIns')}
                            </span>
                            <span className="text-xs font-bold text-primary">{player.buyIns} 手</span>
                          </div>
                        </div>
                        {!isSettlementMode && (
                          <button 
                            onClick={() => {
                              setCashOutPlayerId(player.id);
                              setCashOutAmount('');
                            }}
                            className="p-2 bg-white/5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all"
                            title={t('game.cashOut')}
                          >
                            <LogOut size={20} />
                          </button>
                        )}
                      </div>

                      {isSettlementMode ? (
                        <div className="flex-1 flex flex-col gap-4 py-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/5 rounded-xl p-3 text-center">
                              <span className="block text-[10px] opacity-40 uppercase font-bold mb-1">{t('settle.totalBuyIn')}</span>
                              <span className="text-xl font-black">{player.buyIns} 手</span>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3 text-center">
                              <span className="block text-[10px] opacity-40 uppercase font-bold mb-1">{t('settle.cost')}</span>
                              <span className="text-xl font-black text-primary">
                                {formatCurrency(player.buyIns * (settings.chipsPerHand || 0) / (settings.chipsPerHand || 1) * (settings.handValueUSD || 0), settings.usdToCnyRate)}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest px-1">{t('settle.remainingChips')}</label>
                            <input 
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder={t('settle.remainingPlaceholder')}
                              value={endGameChips[player.id] ?? ''}
                              onChange={e => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setEndGameChips({ ...endGameChips, [player.id]: val === '' ? undefined : Number(val) });
                              }}
                              className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 text-2xl font-black outline-none focus:border-primary text-center"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 flex flex-col justify-center items-center py-4">
                            <span className="text-5xl font-black text-primary mb-2">
                              {player.buyIns}
                            </span>
                            <span className="text-xs font-bold opacity-40 uppercase tracking-widest">{t('game.buyIns')}</span>
                          </div>

                          <button 
                            onClick={() => buyIn(player.id)}
                            className="w-full py-6 bg-primary text-white rounded-2xl font-black text-2xl shadow-xl shadow-primary/30 hover:bg-primary/80 active:scale-95 transition-all flex items-center justify-center gap-3"
                          >
                            <Plus size={32} strokeWidth={3} />
                            +1 手
                          </button>
                        </>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {players.length === 0 && (
                  <div className="col-span-full py-20 text-center space-y-4 opacity-20">
                    <CreditCard size={64} className="mx-auto" />
                    <p className="text-lg font-medium italic">{t('game.noActivePlayers')}</p>
                  </div>
                )}
              </div>

              {isSettlementMode && activePlayers.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pt-8 space-y-4"
                >
                  <div className={`glass-card p-6 rounded-3xl border-2 transition-all ${isBalanced ? 'border-success/50 bg-success/5' : 'border-danger/50 bg-danger/5'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Scale size={20} className={isBalanced ? 'text-success' : 'text-danger'} />
                        <span className="text-sm font-bold uppercase tracking-widest">{t('settle.balanced')}</span>
                      </div>
                      {isBalanced ? (
                        <span className="px-3 py-1 bg-success/20 text-success rounded-full text-[10px] font-black uppercase">{t('settle.balanced')}</span>
                      ) : (
                        <span className="px-3 py-1 bg-danger/20 text-danger rounded-full text-[10px] font-black uppercase">{t('settle.unbalanced')}</span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] opacity-40 font-bold uppercase">{t('settle.totalBuyIn')}</span>
                        <div className="text-xl font-black">{totalBuyInChips}</div>
                      </div>
                      <div className="space-y-1 text-right">
                        <span className="text-[10px] opacity-40 font-bold uppercase">{t('settle.remainingChips')}</span>
                        <div className="text-xl font-black">{totalRemainingChips}</div>
                      </div>
                    </div>

                    {!isBalanced && (
                      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                        <span className="text-xs font-bold opacity-60">{t('settle.diff')}</span>
                        <span className="text-lg font-black text-danger">
                          {totalRemainingChips - totalBuyInChips > 0 ? '+' : ''}
                          {totalRemainingChips - totalBuyInChips}
                        </span>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={finalizeSettlement}
                    className="w-full py-6 bg-primary text-white rounded-3xl font-black text-2xl shadow-2xl shadow-primary/30 hover:bg-primary/80 active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    <CheckCircle2 size={32} />
                    {t('settle.finalize')}
                  </button>
                </motion.div>
              )}

              {settledPlayers.length > 0 && (
                <div className="space-y-4 pt-8 border-t border-white/5">
                  <h3 className="text-sm font-bold opacity-40 uppercase tracking-widest px-2">{t('game.cashOut')}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {settledPlayers.map(player => (
                      <div 
                        key={player.id}
                        className="glass-card rounded-3xl p-6 border border-white/5 opacity-50 grayscale flex flex-col gap-4 relative"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-xl font-bold mb-1">{player.name}</h3>
                            <p className="text-xs font-medium text-white/60">
                              {t('game.buyIns')} {player.buyIns} 手 ➜ {t('game.cashOut')} {player.totalCashOuts}
                            </p>
                          </div>
                          <button 
                            onClick={() => rejoin(player.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-primary/20 text-primary rounded-lg text-xs font-bold hover:bg-primary/30 transition-all"
                          >
                            <RotateCcw size={14} />
                            {t('game.rejoin')}
                          </button>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-2xl">
                          <span className="text-xs font-bold opacity-40">{t('settle.profit')}</span>
                          <span className={`text-lg font-black ${player.totalCashOuts - (player.buyIns * (settings.chipsPerHand || 0)) >= 0 ? 'text-success' : 'text-danger'}`}>
                            {player.totalCashOuts - (player.buyIns * (settings.chipsPerHand || 0)) > 0 ? '+' : ''}
                            {player.totalCashOuts - (player.buyIns * (settings.chipsPerHand || 0))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isSettlementMode && (
                <div className="glass-card rounded-3xl p-6 border border-white/5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold opacity-40 uppercase tracking-widest">{t('game.logs')}</h3>
                    <span className="text-[10px] opacity-30 font-mono">{t('game.recentLogs')}</span>
                  </div>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    <AnimatePresence initial={false}>
                      {logs.map(log => (
                        <motion.div 
                          key={log.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono opacity-30">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-sm font-bold">{log.playerName}</span>
                            <span className="text-xs opacity-60">
                              {log.type === 'buy-in' && `${t('game.buyIns')} ${log.prevBuyIns! + 1}`}
                              {log.type === 'cash-out' && `${t('game.cashOut')} (${log.amount})`}
                              {log.type === 'rejoin' && t('game.rejoin')}
                              {log.type === 'add-player' && t('game.add')}
                              {log.type === 'remove-player' && t('game.remove')}
                            </span>
                          </div>
                          {Date.now() - log.timestamp < 5 * 60 * 1000 && (
                            <button 
                              onClick={() => undo(log.id)}
                              className="flex items-center gap-1 px-2 py-1 bg-white/5 rounded-lg text-[10px] font-bold text-white/40 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Undo2 size={12} />
                              {t('common.undo')}
                            </button>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {logs.length === 0 && (
                      <div className="py-8 text-center opacity-20 text-sm italic">{t('history.noHistory')}</div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'settlement' && (
            <motion.div
              key="settlement"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="glass-card p-6 rounded-2xl">
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                  <Calculator size={20} className="text-primary" />
                  {t('settle.title')}
                </h2>

                {!isBalanced && (
                  <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-xl flex items-start gap-3 animate-pulse">
                    <AlertTriangle className="text-danger shrink-0" size={20} />
                    <div className="text-xs text-danger">
                      <p className="font-bold mb-1">{t('settle.unbalanced')}！</p>
                      <p>{t('settle.totalBuyIn')}: {totalBuyInChips} | {t('settle.remainingChips')}: {totalRemainingChips}</p>
                      <p>{t('settle.diff')}: {totalRemainingChips - totalBuyInChips} {t('settle.remainingChips')}</p>
                    </div>
                  </div>
                )}
                
                <div className="space-y-4 mb-8">
                  {previewPlayers.map(p => {
                    const totalReturned = (p.remainingChips || 0) + (p.totalCashOuts || 0);
                    const profit = (totalReturned - (p.buyIns * (settings.chipsPerHand || 0))) / (settings.chipsPerHand || 1) * (settings.handValueUSD || 0);
                    return (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-background rounded-xl">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{p.name}</span>
                          {!p.isSettled && <span className="text-[10px] bg-warning/20 text-warning px-2 py-0.5 rounded-full">未結算</span>}
                        </div>
                        <div className="text-right">
                          <div className={`font-mono font-bold ${profit >= 0 ? 'text-success' : 'text-danger'}`}>
                            {profit >= 0 ? '+' : ''}{formatCurrency(profit, settings.usdToCnyRate)}
                          </div>
                          <div className="text-[10px] opacity-40 font-bold uppercase tracking-tighter">
                            {p.buyIns} 手 / 總計帶走 {totalReturned}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {previewPlayers.length > 0 && previewPlayers.every(p => p.isSettled) ? (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-bold opacity-40 uppercase tracking-widest">{t('settle.transferSuggestions')}</h3>
                      </div>
                      <div className="space-y-2">
                        {calculateTransfers(previewPlayers.map(p => ({ ...p, remainingChips: (p.remainingChips || 0) + p.totalCashOuts })), settings).length > 0 ? (
                          calculateTransfers(previewPlayers.map(p => ({ ...p, remainingChips: (p.remainingChips || 0) + p.totalCashOuts })), settings).map((t, idx) => (
                            <div key={idx} className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-danger">{t.from}</span>
                                <ArrowRightLeft size={14} className="opacity-20" />
                                <span className="font-bold text-success">{t.to}</span>
                              </div>
                              <div className="text-right">
                                <div className="font-mono font-black text-primary">{formatCurrency(t.amount, settings.usdToCnyRate)}</div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 bg-success/5 border border-success/10 rounded-xl text-center">
                            <p className="text-success font-bold">{t('settle.buddhaBalance')}</p>
                            <p className="text-[10px] text-success/60 mt-1 uppercase tracking-widest">Buddha Mode Balance Achieved</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-3">
                        <button 
                          onClick={() => {
                            const transfers = calculateTransfers(previewPlayers.map(p => ({ ...p, remainingChips: (p.remainingChips || 0) + p.totalCashOuts })), settings);
                            const text = transfers.map(tr => `${tr.from} ${t('history.shouldPay')} ${tr.to} ${t('history.total')} ${formatCurrency(tr.amount, settings.usdToCnyRate)}`).join('\n');
                            navigator.clipboard.writeText(text);
                            showToast(t('settle.copied'), 'success');
                          }}
                          className="flex-1 py-4 bg-white/5 text-white rounded-2xl font-bold border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                        >
                          <ArrowRightLeft size={18} />
                          {t('common.copy')}
                        </button>
                        <button 
                          onClick={saveToHistory}
                          className="flex-[2] py-4 bg-success text-white rounded-2xl font-bold shadow-xl shadow-success/20 hover:bg-success/90 transition-colors"
                        >
                          {t('settle.saveHistory')}
                        </button>
                      </div>
                      
                      {isSettlementMode && (
                        <button 
                          onClick={() => setActiveTab('game')}
                          className="w-full py-3 bg-white/5 text-white/60 rounded-xl font-bold border border-white/5 hover:bg-white/10 transition-colors"
                        >
                          {t('settle.back')}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-8 opacity-50">
                    <p>
                      {players.length === 0 
                        ? t('game.noActivePlayers') 
                        : t('settle.finalize')}
                    </p>
                    <button 
                      onClick={() => setActiveTab('game')}
                      className="mt-4 text-primary font-bold underline"
                    >
                      {players.length === 0 ? t('game.add') : t('settle.back')}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <section className="glass-card p-6 rounded-2xl">
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                  <Trophy size={20} className="text-warning" />
                  總排行榜
                </h2>
                
                <div className="space-y-4">
                  {stats.length > 0 ? stats.map((s, idx) => (
                    <div key={s.name} className="flex items-center justify-between p-4 bg-background rounded-xl border border-white/5">
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-warning text-black' : 
                          idx === 1 ? 'bg-slate-300 text-black' : 
                          idx === 2 ? 'bg-amber-700 text-white' : 'bg-white/10'
                        }`}>
                          {idx + 1}
                        </div>
                        <div>
                          <h3 className="font-bold">{s.name}</h3>
                          <p className="text-xs opacity-40">{s.gamesPlayed} 場對局</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${s.totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                          {s.totalProfit >= 0 ? '+' : ''}{formatCurrency(s.totalProfit, settings.usdToCnyRate)}
                        </div>
                        <div className="text-[10px] opacity-30">
                          Max: +{s.maxWin.toFixed(1)} / {s.maxLoss.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-12 opacity-30">
                      <History size={48} className="mx-auto mb-4 opacity-20" />
                      <p>{t('history.noHistory')}</p>
                    </div>
                  )}
                </div>
              </section>

              {history.length > 0 && (
                <section className="glass-card p-6 rounded-2xl">
                  <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <History size={20} className="text-primary" />
                    {t('nav.history')}
                  </h2>
                  <div className="space-y-4">
                    {history.map(record => (
                      <div key={record.id} className="p-4 bg-background/40 rounded-xl border border-white/5 text-sm relative group overflow-hidden">
                        <AnimatePresence>
                          {deletingId === record.id && (
                            <motion.div 
                              initial={{ opacity: 0, x: 100 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 100 }}
                              className="absolute inset-0 bg-danger/95 z-30 flex items-center justify-center gap-4 backdrop-blur-md"
                            >
                              <span className="font-bold text-white">{t('history.deleteConfirm')}</span>
                              <div className="flex gap-2">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteHistoryRecord(record.id);
                                  }}
                                  className="px-4 py-2 bg-white text-danger rounded-xl font-bold text-xs hover:bg-white/90 transition-colors"
                                >
                                  {t('common.confirm')}
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingId(null);
                                  }}
                                  className="px-4 py-2 bg-black/20 text-white rounded-xl font-bold text-xs hover:bg-black/30 transition-colors"
                                >
                                  {t('common.cancel')}
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeletingId(record.id);
                          }}
                          className="absolute top-3 right-3 p-1.5 text-danger opacity-40 hover:opacity-100 transition-opacity bg-danger/10 rounded-lg z-20 cursor-pointer"
                          title="刪除此記錄"
                        >
                          <Trash2 size={14} />
                        </button>
                        <div className="flex justify-between items-center mb-2 pr-8">
                          <div className="flex flex-col">
                            <span className="font-bold text-white mb-0.5">{record.gameName || '未命名對局'}</span>
                            <span className="opacity-50 font-mono text-[10px]">{new Date(record.date).toLocaleDateString()} {new Date(record.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-primary">{record.players.length} 人</span>
                            <button 
                              onClick={() => setExpandedHistoryId(expandedHistoryId === record.id ? null : record.id)}
                              className="p-1 hover:bg-white/5 rounded-lg transition-colors text-white/40 hover:text-white"
                            >
                              {expandedHistoryId === record.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>

                        <AnimatePresence>
                          {expandedHistoryId === record.id && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-3 mt-3 border-t border-white/5 space-y-2">
                                <div className="flex items-center gap-2 text-[10px] font-bold opacity-40 uppercase tracking-widest mb-2">
                                  <ArrowRightLeft size={12} />
                                  {t('history.transferDetails')}
                                </div>
                                {record.transfers && record.transfers.length > 0 ? (
                                  record.transfers.map((t, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-white/5 p-2 rounded-lg text-[11px]">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-white/80">{t.from}</span>
                                        <ArrowRightLeft size={10} className="opacity-30" />
                                        <span className="font-bold text-white/80">{t.to}</span>
                                      </div>
                                      <span className="font-mono font-bold text-primary">
                                        {formatCurrency(t.amount, record.settings.usdToCnyRate)}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-center py-2 opacity-30 text-[10px]">
                                    {t('history.noTransfers')}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {record.players.map(p => {
                            const totalReturned = (p.remainingChips || 0) + (p.totalCashOuts || 0);
                            const profit = (totalReturned - (p.buyIns * (record.settings.chipsPerHand || 0))) / (record.settings.chipsPerHand || 1) * (record.settings.handValueUSD || 0);
                            return (
                              <span key={p.name} className={`px-2 py-0.5 rounded text-[10px] ${profit >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                                {p.name} {profit >= 0 ? '+' : ''}{profit.toFixed(1)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button 
                    onClick={() => setIsClearingAll(true)}
                    className="w-full mt-8 py-4 text-danger/60 hover:text-danger text-xs font-bold uppercase tracking-widest border border-dashed border-danger/20 hover:border-danger/50 rounded-xl transition-all"
                  >
                    {t('history.clearAll')}
                  </button>
                </section>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {cashOutPlayerId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-card w-full max-w-sm rounded-3xl p-8 border border-white/10 shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-2">{t('game.cashOut')}</h3>
              <p className="text-sm opacity-60 mb-6">
                {t('game.cashOutPrompt', { name: players.find(p => p.id === cashOutPlayerId)?.name })}
              </p>
              <input 
                type="number" 
                autoFocus
                value={cashOutAmount}
                onChange={e => setCashOutAmount(e.target.value)}
                placeholder={t('game.cashOutPlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-2xl font-black outline-none focus:border-primary mb-6 text-center"
                onKeyDown={e => {
                  if (e.key === 'Enter' && cashOutAmount !== '') {
                    cashOut(cashOutPlayerId, Number(cashOutAmount));
                    setCashOutPlayerId(null);
                  }
                }}
              />
              <div className="flex gap-3">
                <button 
                  onClick={() => setCashOutPlayerId(null)}
                  className="flex-1 py-4 bg-white/5 rounded-2xl font-bold hover:bg-white/10 transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  onClick={() => {
                    if (cashOutAmount !== '') {
                      cashOut(cashOutPlayerId, Number(cashOutAmount));
                      setCashOutPlayerId(null);
                    }
                  }}
                  className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/80 transition-all"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showResetConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-card w-full max-w-sm rounded-3xl p-8 border border-white/10 shadow-2xl text-center"
            >
              <AlertTriangle className="mx-auto text-danger mb-4" size={48} />
              <h3 className="text-xl font-bold mb-2">{t('game.resetConfirmTitle')}</h3>
              <p className="text-sm opacity-60 mb-8">{t('game.resetConfirmDesc')}</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-4 bg-white/5 rounded-2xl font-bold"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  onClick={resetGame}
                  className="flex-1 py-4 bg-danger text-white rounded-2xl font-bold shadow-lg shadow-danger/20"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isClearingAll && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 rounded-3xl max-w-sm w-full border border-white/10 text-center space-y-6 shadow-2xl"
            >
              <div className="w-20 h-20 bg-danger/20 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle size={40} className="text-danger" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black">{t('history.clearAllConfirmTitle')}</h3>
                <p className="text-sm opacity-60">{t('history.clearAllConfirmDesc')}</p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={clearAllHistory}
                  className="w-full py-4 bg-danger text-white rounded-2xl font-bold hover:bg-danger/80 transition-all shadow-lg shadow-danger/20"
                >
                  {t('common.confirm')}
                </button>
                <button 
                  onClick={() => setIsClearingAll(false)}
                  className="w-full py-4 bg-white/5 text-white rounded-2xl font-bold hover:bg-white/10 transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 glass border border-white/10"
          >
            <div className={`w-2 h-2 rounded-full ${
              toast.type === 'success' ? 'bg-success' : 
              toast.type === 'error' ? 'bg-danger' : 'bg-primary'
            }`} />
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 p-4 glass border-t border-white/5 z-40">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={20} />} label="設定" />
          <NavButton active={activeTab === 'game'} onClick={() => setActiveTab('game')} icon={<Plus size={20} />} label="遊戲" />
          <NavButton active={activeTab === 'settlement'} onClick={() => setActiveTab('settlement')} icon={<Calculator size={20} />} label="結算" />
          <NavButton active={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')} icon={<Trophy size={20} />} label="排行" />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-primary scale-110' : 'text-white/40 hover:text-white'}`}
    >
      <div className={`p-2 rounded-xl ${active ? 'bg-primary/10' : ''}`}>
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}
