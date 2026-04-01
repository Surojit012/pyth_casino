'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useMarketData } from '@/context/MarketDataContext';
import { useSound } from '@/context/SoundContext';
import { formatPrice } from '@/lib/pyth';
import { persistGameRound } from '@/lib/clientGameRounds';
import { SLOT_SYMBOLS } from '@/lib/entropy';
import { getSlotsVolatilityMultiplier } from '@/lib/volatility';
import { useGameProof } from '@/context/ProofContext';
import ResultOverlay from '@/components/ResultOverlay';
import ProofPanel from '@/components/ProofPanel';
import { Gamepad2, PartyPopper, Sparkles, Frown, Rocket, Gauge } from 'lucide-react';
import { SymbolIcon } from '@/components/SymbolIcon';
import { readCasinoJwt } from '@/lib/clientCasinoAuth';
import { getConfiguredSlotsRandomnessProviderClient, getConfiguredSlotsRandomnessProviderLabel } from '@/lib/randomness/provider';
import styles from './page.module.css';

type GameState = 'idle' | 'spinning' | 'pending' | 'result';
type ReelTriplet = [string, string, string];
type ReelStrip = string[];

const BET_PRESETS = [0.01, 0.05, 0.1, 0.25];
const REEL_STOP_TIMINGS = {
  LOW: [1150, 1750, 2350],
  MEDIUM: [980, 1520, 2060],
  HIGH: [820, 1260, 1700],
} as const;

interface SpinResult {
  symbols: [string, string, string];
  payout: number;
  multiplier: number;
  isWin: boolean;
  matchType: string;
  volatilityMultiplier: number;
  provider?: string;
  requestId?: string;
  newBalance?: number;
}

interface PendingSpin {
  requestId: string;
  provider: string;
  providerLabel: string;
  message?: string;
}

interface PolledRandomnessRequest {
  requestId: string;
  provider: string;
  status: 'pending' | 'fulfilled' | 'failed';
  betAmount: number;
  volatilityMultiplier: number;
  asset: string;
  startPrice: number;
  dataSource: string | null;
  randomnessSeed: string | null;
  resolvedSymbols: string[] | null;
  payoutAmount: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

interface OverlayState {
  open: boolean;
  variant: 'win' | 'loss';
  title: React.ReactNode;
  subtitle: string;
  amountText?: string;
  details?: React.ReactNode;
  icon?: React.ReactNode;
}

function randomSymbol(exclude?: string) {
  const filtered = exclude ? SLOT_SYMBOLS.filter(symbol => symbol !== exclude) : SLOT_SYMBOLS;
  return filtered[Math.floor(Math.random() * filtered.length)] ?? 'slot';
}

function fallbackSymbol(index: number, exclude?: string) {
  const filtered = exclude ? SLOT_SYMBOLS.filter(symbol => symbol !== exclude) : SLOT_SYMBOLS;
  return filtered[index % filtered.length] ?? 'slot';
}

function buildReelTriplet(center?: string): ReelTriplet {
  const middle = center ?? randomSymbol();
  return [randomSymbol(middle), middle, randomSymbol(middle)];
}

function buildSpinStrip(highlight?: string): ReelStrip {
  const symbols = Array.from({ length: 14 }, () => randomSymbol());
  return [
    ...symbols.slice(0, 4),
    randomSymbol(highlight),
    highlight ?? randomSymbol(),
    randomSymbol(highlight),
    ...symbols.slice(4),
  ];
}

function buildStaticReelTriplet(center: string, offset: number): ReelTriplet {
  return [fallbackSymbol(offset, center), center, fallbackSymbol(offset + 1, center)];
}

function buildStaticSpinStrip(highlight: string, offset: number): ReelStrip {
  const symbols = Array.from({ length: 14 }, (_, index) => fallbackSymbol(index + offset, highlight));
  return [
    ...symbols.slice(0, 4),
    fallbackSymbol(offset + 14, highlight),
    highlight,
    fallbackSymbol(offset + 15, highlight),
    ...symbols.slice(4),
  ];
}

function getWinningIndexes(symbols: [string, string, string]) {
  const groups = new Map<string, number[]>();
  symbols.forEach((symbol, index) => {
    groups.set(symbol, [...(groups.get(symbol) ?? []), index]);
  });

  const winningGroup = [...groups.values()].find(indexes => indexes.length >= 2);
  return winningGroup ?? [];
}

export default function SlotsPage() {
  const { balance, refreshSolanaTokenBalance } = useWallet();
  const { current: solMarket, sourceLabel } = useMarketData('SOL');
  const { unlockAudio, playCue } = useSound();
  const { latestProof, proofHistory, recordProof } = useGameProof('slots');

  const [betAmount, setBetAmount] = useState(0.05);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [reelColumns, setReelColumns] = useState<ReelTriplet[]>(() => [
    buildStaticReelTriplet('slot', 0),
    buildStaticReelTriplet('slot', 2),
    buildStaticReelTriplet('slot', 4),
  ]);
  const [reelSpinStrips, setReelSpinStrips] = useState<ReelStrip[]>(() => [
    buildStaticSpinStrip('slot', 0),
    buildStaticSpinStrip('slot', 3),
    buildStaticSpinStrip('slot', 6),
  ]);
  const [spinningReels, setSpinningReels] = useState([false, false, false]);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [history, setHistory] = useState<SpinResult[]>([]);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [pendingSpin, setPendingSpin] = useState<PendingSpin | null>(null);
  const [overlay, setOverlay] = useState<OverlayState>({
    open: false,
    variant: 'loss',
    title: '',
    subtitle: '',
  });

  const spinTimeouts = useRef<NodeJS.Timeout[]>([]);
  const latestSolPriceRef = useRef(solMarket?.price ?? 0);
  const roundStartPriceRef = useRef(0);
  const roundSeedRef = useRef<string | undefined>(undefined);
  const lastSpinTimeRef = useRef(0);
  const roundOutcomeRef = useRef<[string, string, string]>(['slot', 'slot', 'slot']);
  const roundResultRef = useRef({ payout: 0, multiplier: 0, isWin: false, matchType: '' });

  const volatilityLevel = solMarket?.volatilityLevel ?? 'LOW';
  const volatility = getSlotsVolatilityMultiplier(volatilityLevel);
  const marketMood = solMarket?.mood ?? 'Market Calm';
  const currentPrice = solMarket?.price ?? latestSolPriceRef.current ?? 0;
  const spinTimings = REEL_STOP_TIMINGS[volatilityLevel];
  const winningIndexes = useMemo(() => (result ? getWinningIndexes(result.symbols) : []), [result]);
  const configuredProvider = getConfiguredSlotsRandomnessProviderClient();
  const randomnessProviderLabel = useMemo(() => {
    if (pendingSpin?.providerLabel) return `Randomness: ${pendingSpin.providerLabel}`;
    if (result?.provider) return `Randomness: ${getConfiguredSlotsRandomnessProviderLabel(result.provider as 'local' | 'pyth_entropy_v2')}`;
    return `Randomness: ${getConfiguredSlotsRandomnessProviderLabel(configuredProvider)}`;
  }, [configuredProvider, pendingSpin?.providerLabel, result?.provider]);
  const previewMultiplier = useMemo(() => {
    if (volatilityLevel === 'HIGH') return 'Hot Reels';
    if (volatilityLevel === 'MEDIUM') return 'Charged';
    return 'Steady';
  }, [volatilityLevel]);

  const finalizeSpinResult = useCallback((input: {
    symbols: [string, string, string];
    payout: number;
    multiplier: number;
    isWin: boolean;
    matchType: string;
    volatilityMultiplier: number;
    provider: string;
    requestId: string;
    randomnessSeed?: string;
    proofRef?: string;
    newBalance?: number;
    volatilityLevelOverride?: typeof volatilityLevel;
    sourceOverride?: string;
  }) => {
    const endPrice = latestSolPriceRef.current || solMarket?.price || roundStartPriceRef.current;
    const startPrice = roundStartPriceRef.current || endPrice;
    const roundVolatilityLevel = input.volatilityLevelOverride ?? volatilityLevel;

    setGameState('result');

    const spinResult: SpinResult = {
      symbols: input.symbols,
      payout: input.payout,
      multiplier: input.multiplier,
      isWin: input.isWin,
      matchType: input.matchType,
      volatilityMultiplier: input.volatilityMultiplier,
      provider: input.provider,
      requestId: input.requestId,
      newBalance: input.newBalance,
    };

    setResult(spinResult);
    setHistory(prev => [spinResult, ...prev].slice(0, 8));
    void refreshSolanaTokenBalance();

    const proof = recordProof({
      asset: 'SOL',
      startPrice,
      endPrice,
      volatilityLevel: roundVolatilityLevel,
      result: input.isWin ? 'win' : 'loss',
      randomnessSeed: input.randomnessSeed ?? roundSeedRef.current,
      randomnessProvider: input.provider,
      randomnessRequestId: input.requestId,
      dataSource: input.sourceOverride ?? sourceLabel,
      signature: input.proofRef,
    });

    const movementPercent = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
    if (input.provider === 'local') {
      void persistGameRound({
        game: 'slots',
        asset: 'SOL',
        betAmount,
        payoutAmount: input.payout,
        result: input.isWin ? 'win' : 'loss',
        startPrice,
        endPrice,
        movementPercent,
        volatilityLevel: roundVolatilityLevel,
        dataSource: input.sourceOverride ?? sourceLabel,
        proofSignature: proof.signature,
        metadata: {
          symbols: input.symbols,
          matchType: input.matchType,
          multiplier: input.multiplier,
          volatilityMultiplier: input.volatilityMultiplier,
          randomnessSeed: input.randomnessSeed ?? roundSeedRef.current,
          randomnessProvider: input.provider,
          randomnessRequestId: input.requestId,
        },
      });
    }

    if (input.isWin) {
      playCue(input.matchType === 'triple' ? 'jackpot' : 'win');
      setOverlay({
        open: true,
        variant: 'win',
        title: <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>WIN x{input.multiplier.toFixed(1)} <Rocket size={28} /></span>,
        subtitle: input.matchType === 'triple' ? 'Jackpot line hit' : 'Volatility payout boosted',
        amountText: `+${input.payout.toFixed(4)} SOL`,
        details: <span>{marketMood} • {roundVolatilityLevel} volatility</span>,
        icon: input.matchType === 'triple' ? <PartyPopper size={64} /> : <Sparkles size={64} />,
      });
    } else {
      playCue('lose');
      setOverlay({
        open: true,
        variant: 'loss',
        title: 'LOSS',
        subtitle: 'No line this round',
        details: <span>Volatility stayed at {roundVolatilityLevel}</span>,
        icon: <Frown size={64} />,
      });
    }
  }, [betAmount, marketMood, playCue, recordProof, refreshSolanaTokenBalance, solMarket?.price, sourceLabel, volatilityLevel]);

  const clearAllTimers = useCallback(() => {
    spinTimeouts.current.forEach(timeout => clearTimeout(timeout));
    spinTimeouts.current = [];
  }, []);

  useEffect(() => {
    latestSolPriceRef.current = solMarket?.price ?? latestSolPriceRef.current;
  }, [solMarket?.price]);

  const spin = useCallback(async () => {
    const now = Date.now();
    if (now - lastSpinTimeRef.current < 2200) return;
    lastSpinTimeRef.current = now;

    clearAllTimers();
    setGameState('spinning');
    setResult(null);
    setSpinError(null);
    setPendingSpin(null);
    setSpinningReels([true, true, true]);
    setOverlay(prev => ({ ...prev, open: false }));

    roundStartPriceRef.current = latestSolPriceRef.current || solMarket?.price || currentPrice || 0;
    roundSeedRef.current = undefined;
    const roundVolatilityLevel = volatilityLevel;
    const currentBetAmount = betAmount;
    const currentVolatility = volatility;
    const jwt = readCasinoJwt();

    if (!jwt) {
      setGameState('idle');
      setSpinningReels([false, false, false]);
      setSpinError('Authenticate your wallet before spinning.');
      return;
    }

    let spinPayload:
      | {
          success: true;
          status: 'pending';
          provider: string;
          providerLabel: string;
          requestId: string;
          message?: string;
        }
      | {
          success: true;
          status: 'resolved';
          randomness: { provider: string; requestId: string; randomnessSeed: string; symbols: [string, string, string] };
          payout: number;
          multiplier: number;
          isWin: boolean;
          matchType: string;
          volatilityMultiplier: number;
          newBalance: number;
        };

    try {
      const response = await fetch('/api/slots/spin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          amount: currentBetAmount,
          volatilityMultiplier: currentVolatility,
          startPrice: roundStartPriceRef.current,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to resolve slot spin');
      }
      spinPayload = payload;
    } catch (error) {
      clearAllTimers();
      setGameState('idle');
      setSpinningReels([false, false, false]);
      setSpinError(error instanceof Error ? error.message : 'Failed to resolve slot spin');
      playCue('lose');
      return;
    }

    if (spinPayload.status === 'pending') {
      clearAllTimers();
      setGameState('pending');
      setSpinningReels([true, true, true]);
      setPendingSpin({
        requestId: spinPayload.requestId,
        provider: spinPayload.provider,
        providerLabel: spinPayload.providerLabel,
        message: spinPayload.message,
      });
      playCue('click');
      return;
    }

    let resolvedPayload: {
      randomness: { provider: string; requestId: string; randomnessSeed: string; symbols: [string, string, string] };
      payout: number;
      multiplier: number;
      isWin: boolean;
      matchType: string;
      volatilityMultiplier: number;
      newBalance: number;
    } = spinPayload;

    const outcome = resolvedPayload.randomness.symbols;
    const res = {
      payout: resolvedPayload.payout,
      multiplier: resolvedPayload.multiplier,
      isWin: resolvedPayload.isWin,
      matchType: resolvedPayload.matchType,
    };
    roundSeedRef.current = resolvedPayload.randomness.randomnessSeed;
    roundOutcomeRef.current = outcome;
    roundResultRef.current = res;
    setReelSpinStrips(outcome.map(symbol => buildSpinStrip(symbol)));

    spinTimings.forEach((timing, index) => {
      spinTimeouts.current.push(
        setTimeout(() => {
          setSpinningReels(prev => prev.map((value, reelIndex) => (reelIndex === index ? false : value)));
          setReelColumns(prev =>
            prev.map((column, reelIndex) =>
              reelIndex === index ? buildReelTriplet(outcome[index]) : column
            ) as ReelTriplet[]
          );
          playCue('click');
        }, timing)
      );
    });

    spinTimeouts.current.push(
      setTimeout(() => {
        clearAllTimers();
        const { payout, multiplier, isWin, matchType } = roundResultRef.current;
        finalizeSpinResult({
          symbols: outcome,
          payout,
          multiplier,
          isWin,
          matchType,
          volatilityMultiplier: resolvedPayload.volatilityMultiplier,
          provider: resolvedPayload.randomness.provider,
          requestId: resolvedPayload.randomness.requestId,
          randomnessSeed: roundSeedRef.current,
          newBalance: resolvedPayload.newBalance,
          volatilityLevelOverride: roundVolatilityLevel,
          sourceOverride: 'Solana Mainnet Stream',
        });
      }, spinTimings[2] + 260)
    );
  }, [
    betAmount,
    clearAllTimers,
    currentPrice,
    finalizeSpinResult,
    playCue,
    solMarket?.price,
    spinTimings,
    volatility,
    volatilityLevel,
  ]);

  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  useEffect(() => {
    if (!pendingSpin) return;

    const jwt = readCasinoJwt();
    if (!jwt) {
      setPendingSpin(null);
      setGameState('idle');
      setSpinError('Authentication expired while waiting for randomness fulfillment.');
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/slots/spin/${pendingSpin.requestId}`, {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? 'Failed to poll randomness request');
        }

        const request = payload?.request as PolledRandomnessRequest | undefined;
        if (!request || cancelled) return;

        if (request.status === 'failed') {
          setPendingSpin(null);
          setGameState('idle');
          setSpinError(request.errorMessage ?? 'Entropy randomness request failed.');
          playCue('lose');
          return;
        }

        if (request.status === 'fulfilled' && Array.isArray(request.resolvedSymbols)) {
          setPendingSpin(null);
          roundSeedRef.current = request.randomnessSeed ?? undefined;
          const resolvedSymbols = request.resolvedSymbols.slice(0, 3) as [string, string, string];
          setGameState('spinning');
          setSpinningReels([true, true, true]);
          setReelSpinStrips(resolvedSymbols.map(symbol => buildSpinStrip(symbol)));

          spinTimings.forEach((timing, index) => {
            spinTimeouts.current.push(
              setTimeout(() => {
                setSpinningReels(prev => prev.map((value, reelIndex) => (reelIndex === index ? false : value)));
                setReelColumns(prev =>
                  prev.map((column, reelIndex) =>
                    reelIndex === index ? buildReelTriplet(resolvedSymbols[index]) : column
                  ) as ReelTriplet[]
                );
                playCue('click');
              }, Math.max(420, timing - 360))
            );
          });

          const metadata = request.metadata ?? {};
          const matchType = typeof metadata.matchType === 'string' ? metadata.matchType : 'none';
          const multiplier = Number(metadata.multiplier ?? 0);
          const newBalance = Number(metadata.newBalance ?? 0);
          const proofRef = typeof metadata.proofRef === 'string' ? metadata.proofRef : undefined;

          spinTimeouts.current.push(
            setTimeout(() => {
              clearAllTimers();
              finalizeSpinResult({
                symbols: resolvedSymbols,
                payout: Number(request.payoutAmount ?? 0),
                multiplier,
                isWin: Number(request.payoutAmount ?? 0) > 0,
                matchType,
                volatilityMultiplier: request.volatilityMultiplier,
                provider: request.provider,
                requestId: request.requestId,
                randomnessSeed: request.randomnessSeed ?? undefined,
                proofRef,
                newBalance,
                sourceOverride: request.dataSource ?? sourceLabel,
              });
            }, Math.max(420, spinTimings[2] - 360) + 260)
          );
          return;
        }
      } catch (error) {
        if (cancelled) return;
        setPendingSpin(null);
        setGameState('idle');
        setSpinError(error instanceof Error ? error.message : 'Failed to poll randomness request');
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 2500);

    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [clearAllTimers, finalizeSpinResult, pendingSpin, playCue, sourceLabel, spinTimings]);

  return (
    <div className={`game-page ${styles.shell}`}>
      <ResultOverlay
        open={overlay.open}
        variant={overlay.variant}
        title={overlay.title}
        subtitle={overlay.subtitle}
        amountText={overlay.amountText}
        details={overlay.details}
        icon={overlay.icon}
        autoHideMs={3400}
        onComplete={() => setOverlay(prev => ({ ...prev, open: false }))}
      />

      <section className={styles.hero}>
        <div className={styles.liveBar}>
          <div className={styles.liveIndicator}>
            <span className={styles.liveDot} />
            <span>Live reels</span>
          </div>
          <div className={styles.techRow}>
            <span>{marketMood}</span>
            <span>{volatilityLevel} Vol</span>
          </div>
        </div>

        <div className={`${styles.priceBoard} ${solMarket?.direction === 'up' ? styles.priceUp : solMarket?.direction === 'down' ? styles.priceDown : styles.priceFlat}`}>
          <span className={styles.assetLabel}>SOL / USD</span>
          <strong className={styles.priceValue}>${formatPrice(currentPrice)}</strong>
          <span className={styles.priceChange}>
            {solMarket?.change15s && solMarket.change15s > 0 ? '+' : ''}
            {solMarket?.change15s?.toFixed(2) ?? '0.00'}% • {previewMultiplier}
          </span>
        </div>

        <div className={styles.previewStrip}>
          <div className={styles.previewCard}>
            <span>Volatility</span>
            <strong>{volatility.toFixed(2)}x</strong>
            <small>{sourceLabel}</small>
          </div>
          <div className={styles.previewCard}>
            <span>Hot line</span>
            <strong>{(50 * volatility).toFixed(1)}x</strong>
            <small>Top triple payout</small>
          </div>
          <div className={styles.previewCard}>
            <span>Bet</span>
            <strong>{betAmount.toFixed(2)} SOL</strong>
            <small>Ready to spin</small>
          </div>
        </div>

        <div className={styles.randomnessBadge}>
          <span className={styles.randomnessDot} />
          <span>{randomnessProviderLabel}</span>
        </div>
      </section>

      <section className={`${styles.machineCard} ${gameState === 'spinning' ? styles.machineLive : ''} ${volatilityLevel === 'HIGH' ? styles.machineWild : ''}`}>
        <div className={styles.machineFrame}>
          <div className={styles.reelDeck}>
            {reelColumns.map((reel, index) => (
              <div
                key={index}
                className={`${styles.reelColumn} ${spinningReels[index] ? styles.reelColumnSpinning : ''} ${winningIndexes.includes(index) ? styles.reelColumnWinning : ''}`}
              >
                <div className={styles.reelMask}>
                  <div className={`${styles.reelStrip} ${spinningReels[index] ? styles.reelStripSpinLong : ''}`}>
                    {(spinningReels[index] ? reelSpinStrips[index] : reel).map((symbol, tripletIndex) => (
                      <div
                        key={`${index}-${tripletIndex}-${symbol}`}
                        className={`${styles.reelCell} ${!spinningReels[index] && tripletIndex === 1 ? styles.reelCenter : styles.reelSide}`}
                      >
                        <SymbolIcon symbol={symbol} size={!spinningReels[index] && tripletIndex === 1 ? 64 : 44} />
                      </div>
                    ))}
                  </div>
                </div>
                <span className={styles.reelTag}>Reel {index + 1}</span>
              </div>
            ))}
          </div>
          <div className={styles.payline} />
        </div>

        <div className={`${styles.resultRibbon} ${result?.isWin ? styles.resultRibbonWin : result ? styles.resultRibbonLoss : ''}`}>
          {gameState === 'spinning' ? (
            <>
              <span className={styles.ribbonLabel}>Spinning</span>
              <strong>Resolving provider-backed spin</strong>
            </>
          ) : gameState === 'pending' && pendingSpin ? (
            <>
              <span className={styles.ribbonLabel}>Pending Randomness</span>
              <strong>Awaiting {pendingSpin.providerLabel}</strong>
              <small>{pendingSpin.message ?? `Request ${pendingSpin.requestId.slice(0, 12)}...`}</small>
            </>
          ) : spinError ? (
            <>
              <span className={styles.ribbonLabel}>Error</span>
              <strong>{spinError}</strong>
              <small>Reconnect and try the spin again</small>
            </>
          ) : result ? (
            result.isWin ? (
              <>
                <span className={styles.ribbonLabel}>Result</span>
                <strong>WIN x{result.multiplier.toFixed(1)}</strong>
                <small>+{result.payout.toFixed(4)} SOL • {result.matchType} • {result.provider}</small>
              </>
            ) : (
              <>
                <span className={styles.ribbonLabel}>Result</span>
                <strong>LOSS</strong>
                <small>Spin again while the market is moving • {result.provider}</small>
              </>
            )
          ) : (
            <>
              <span className={styles.ribbonLabel}>Ready</span>
              <strong>Pick a stake and spin</strong>
            </>
          )}
        </div>
      </section>

      <section className={styles.controlsCard}>
        <div className={styles.controlsTop}>
          <div>
            <span className={styles.controlLabel}>Quick bet</span>
            <div className={styles.betPresets}>
              {BET_PRESETS.map(preset => (
                <button
                  key={preset}
                  className={`${styles.presetBtn} ${betAmount === preset ? styles.presetBtnActive : ''}`}
                  onClick={() => {
                    unlockAudio();
                    playCue('click');
                    setBetAmount(preset);
                  }}
                  disabled={gameState === 'spinning'}
                >
                  {preset.toFixed(2)} SOL
                </button>
              ))}
            </div>
          </div>

          <div className={styles.payoutPreview}>
            <span className={styles.controlLabel}>Potential line</span>
            <strong>{(betAmount * volatility).toFixed(4)} to {(betAmount * 50 * volatility).toFixed(4)} SOL</strong>
            <small>Any pair to top triple, volatility included</small>
          </div>
        </div>

        <button
          className={`${styles.spinBtn} ${gameState === 'spinning' ? styles.spinBtnSpinning : ''}`}
          onClick={() => {
            unlockAudio();
            playCue('click');
            void spin();
          }}
          disabled={gameState === 'spinning' || gameState === 'pending' || betAmount <= 0 || betAmount > balance}
        >
          <span className={styles.spinBtnGlow} />
          <span className={styles.spinBtnText}>
            <Gamepad2 size={22} />
            {gameState === 'spinning' ? 'SPINNING...' : gameState === 'pending' ? 'AWAITING ENTROPY...' : 'SPIN'}
          </span>
        </button>
      </section>

      {gameState === 'result' ? <ProofPanel proof={latestProof} history={proofHistory} /> : null}

      <section className={styles.footerGrid}>
        <div className={styles.payoutTable}>
          <h3 className={styles.footerTitle}>Payout Table</h3>
          <div className={styles.payoutGrid}>
            <div className={styles.payoutRow}><span><SymbolIcon symbol="btc" size={18} /> <SymbolIcon symbol="btc" size={18} /> <SymbolIcon symbol="btc" size={18} /></span><strong>{(50 * volatility).toFixed(1)}x</strong></div>
            <div className={styles.payoutRow}><span><SymbolIcon symbol="eth" size={18} /> <SymbolIcon symbol="eth" size={18} /> <SymbolIcon symbol="eth" size={18} /></span><strong>{(25 * volatility).toFixed(1)}x</strong></div>
            <div className={styles.payoutRow}><span><SymbolIcon symbol="slot" size={18} /> <SymbolIcon symbol="slot" size={18} /> <SymbolIcon symbol="slot" size={18} /></span><strong>{(20 * volatility).toFixed(1)}x</strong></div>
            <div className={styles.payoutRow}><span><SymbolIcon symbol="sol" size={18} /> <SymbolIcon symbol="sol" size={18} /> <SymbolIcon symbol="sol" size={18} /></span><strong>{(15 * volatility).toFixed(1)}x</strong></div>
            <div className={styles.payoutRow}><span><SymbolIcon symbol="diamond" size={18} /> <SymbolIcon symbol="diamond" size={18} /> <SymbolIcon symbol="diamond" size={18} /></span><strong>{(10 * volatility).toFixed(1)}x</strong></div>
            <div className={styles.payoutRow}><span>Any Pair</span><strong>{(1.5 * volatility).toFixed(1)}x</strong></div>
          </div>
        </div>

        <div className={styles.historyCard}>
          <h3 className={styles.footerTitle}>Recent Spins</h3>
          <div className={styles.historyList}>
            {history.length > 0 ? (
              history.map((spin, index) => (
                <div key={`${spin.symbols.join('-')}-${index}`} className={`${styles.historyItem} ${spin.isWin ? styles.historyWin : ''}`}>
                  <span className={styles.historySymbols}>
                    {spin.symbols.map((symbol, symbolIndex) => (
                      <SymbolIcon key={`${symbol}-${symbolIndex}`} symbol={symbol} size={18} />
                    ))}
                  </span>
                  <span className={styles.historyMeta}>{spin.isWin ? `+${spin.payout.toFixed(4)} SOL` : 'LOSS'}{spin.requestId ? ` • ${spin.requestId.slice(0, 8)}` : ''}</span>
                </div>
              ))
            ) : (
              <div className={styles.historyEmpty}>
                <Gauge size={18} />
                <span>No spins yet. Hit SPIN to light up the machine.</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
