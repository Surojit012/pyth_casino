'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useMarketData } from '@/context/MarketDataContext';
import { useSound } from '@/context/SoundContext';
import { useGameProof } from '@/context/ProofContext';
import { persistGameRound } from '@/lib/clientGameRounds';
import { formatPrice } from '@/lib/pyth';
import { getLiquidationDifficultyScalar, type DangerLevel, type VolatilityLevel } from '@/lib/volatility';
import ResultOverlay from '@/components/ResultOverlay';
import ProofPanel from '@/components/ProofPanel';
import { Skull, TrendingUp, TrendingDown, Zap, Wallet, Rocket, Activity, TimerReset } from 'lucide-react';
import styles from './page.module.css';

type GameState = 'setup' | 'playing' | 'liquidated' | 'cashed_out';

interface PricePoint {
  price: number;
  time: number;
}

interface OverlayState {
  open: boolean;
  variant: 'win' | 'loss' | 'liquidated';
  title: React.ReactNode;
  subtitle: string;
  amountText?: string;
  details?: React.ReactNode;
  icon?: React.ReactNode;
}

const LEVERAGE_OPTIONS = [2, 5, 10, 20, 50, 100];
const BET_PRESETS = [0.01, 0.05, 0.1, 0.25];
const TICK_INTERVAL = 500;
const TARGET_SURVIVAL_SECONDS = 20;

function getDangerDrift(level: DangerLevel): number {
  if (level === 'CRITICAL') return 0.000025;
  if (level === 'DANGER') return 0.000012;
  if (level === 'WATCH') return 0.000004;
  return 0;
}

function getDangerScore(level: DangerLevel, distanceRatio: number) {
  const base = level === 'CRITICAL' ? 92 : level === 'DANGER' ? 72 : level === 'WATCH' ? 46 : 20;
  const distanceBoost = Math.max(0, 1 - Math.min(1, distanceRatio)) * 18;
  return Math.min(100, base + distanceBoost);
}

function dangerClass(level: DangerLevel): string {
  if (level === 'CRITICAL') return styles.dangerCritical;
  if (level === 'DANGER') return styles.dangerHigh;
  if (level === 'WATCH') return styles.dangerWatch;
  return styles.dangerSafe;
}

export default function LiquidationPage() {
  const { balance, placeBet, addWinnings } = useWallet();
  const { current: solMarket, sourceLabel } = useMarketData('SOL');
  const { unlockAudio, playCue } = useSound();
  const { latestProof, proofHistory, recordProof } = useGameProof('liquidation');

  const [betAmount, setBetAmount] = useState(0.05);
  const [leverage, setLeverage] = useState(10);
  const [gameState, setGameState] = useState<GameState>('setup');
  const [entryPrice, setEntryPrice] = useState(0);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [pnl, setPnl] = useState(0);
  const [pnlPercent, setPnlPercent] = useState(0);
  const [liquidationPrice, setLiquidationPrice] = useState(0);
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [payout, setPayout] = useState(0);
  const [overlay, setOverlay] = useState<OverlayState>({
    open: false,
    variant: 'loss',
    title: '',
    subtitle: '',
  });

  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const survivalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const basePriceRef = useRef(0);
  const roundProofRecordedRef = useRef(false);
  const marketSnapshotRef = useRef<{
    price: number;
    volatilityLevel: VolatilityLevel;
    difficultyScalar: number;
    dangerLevel: DangerLevel;
  }>({
    price: solMarket?.price ?? 0,
    volatilityLevel: solMarket?.volatilityLevel ?? 'LOW',
    difficultyScalar: getLiquidationDifficultyScalar(solMarket?.volatilityLevel ?? 'LOW'),
    dangerLevel: solMarket?.dangerLevel ?? 'SAFE',
  });

  const liquidationThreshold = 1 / leverage;
  const leverageIndex = LEVERAGE_OPTIONS.indexOf(leverage);
  const currentDangerLevel = solMarket?.dangerLevel ?? 'SAFE';
  const liveTicks = solMarket?.ticks ?? [];

  useEffect(() => {
    const level = solMarket?.dangerLevel ?? 'SAFE';
    const volLevel = solMarket?.volatilityLevel ?? 'LOW';
    const scalar = getLiquidationDifficultyScalar(volLevel);
    marketSnapshotRef.current = {
      price: solMarket?.price ?? marketSnapshotRef.current.price,
      volatilityLevel: volLevel,
      difficultyScalar: scalar,
      dangerLevel: level,
    };
  }, [solMarket]);

  const clearTimers = useCallback(() => {
    if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    if (survivalRef.current) clearInterval(survivalRef.current);
  }, []);

  const startGame = useCallback(async () => {
    const betSuccess = await placeBet(betAmount);
    if (!betSuccess) return;

    let entry = solMarket?.price ?? 0;
    if (!entry || !Number.isFinite(entry)) {
      entry = marketSnapshotRef.current.price || 142.35;
    }

    basePriceRef.current = entry;
    setEntryPrice(entry);
    setCurrentPrice(entry);

    const liqPrice = direction === 'long'
      ? entry * (1 - liquidationThreshold)
      : entry * (1 + liquidationThreshold);
    setLiquidationPrice(liqPrice);

    setPriceHistory([{ price: entry, time: 0 }]);
    setSurvivalTime(0);
    setPnl(0);
    setPnlPercent(0);
    setOverlay(prev => ({ ...prev, open: false }));
    roundProofRecordedRef.current = false;
    setGameState('playing');

    let elapsed = 0;
    let basePrice = entry;

    gameLoopRef.current = setInterval(() => {
      const live = marketSnapshotRef.current;
      const randArray = new Uint32Array(1);
      crypto.getRandomValues(randArray);
      const randomWalk = (randArray[0] / (0xffffffff + 1) - 0.5) * 2;
      const difficultyVol = 0.0003 * leverage * 0.3 * live.difficultyScalar;
      const meanReversion = (basePriceRef.current - basePrice) * 0.00001;
      const adverseDrift = getDangerDrift(live.dangerLevel) * basePrice;
      const directionalAdverse = direction === 'long' ? -adverseDrift : adverseDrift;
      const change = basePrice * (difficultyVol * randomWalk + meanReversion) + directionalAdverse;
      basePrice += change;

      elapsed += TICK_INTERVAL;
      if (elapsed % 5000 === 0 && live.price > 0) {
        basePriceRef.current = live.price;
        basePrice = basePrice * 0.72 + live.price * 0.28;
      }

      const price = basePrice;
      setCurrentPrice(price);

      const priceChange = direction === 'long'
        ? (price - entry) / entry
        : (entry - price) / entry;
      const leveragedPnl = priceChange * leverage;
      const pnlAmount = betAmount * leveragedPnl;

      setPnl(pnlAmount);
      setPnlPercent(leveragedPnl * 100);
      setPriceHistory(prev => [...prev.slice(-100), { price, time: elapsed }]);

      if (leveragedPnl <= -1) {
        clearTimers();
        setGameState('liquidated');
        setPnl(-betAmount);
        setPnlPercent(-100);
        const shouldRecord = !roundProofRecordedRef.current;
        roundProofRecordedRef.current = true;

        if (shouldRecord) {
          const proof = recordProof({
            asset: 'SOL',
            startPrice: entry,
            endPrice: price,
            volatilityLevel: live.volatilityLevel,
            result: 'loss',
            dataSource: 'Solana Mainnet Stream',
          });

          const movementPercent = entry > 0 ? ((price - entry) / entry) * 100 : 0;
          void persistGameRound({
            game: 'liquidation',
            asset: 'SOL',
            direction: direction.toUpperCase(),
            betAmount,
            payoutAmount: 0,
            result: 'loss',
            startPrice: entry,
            endPrice: price,
            movementPercent,
            volatilityLevel: live.volatilityLevel,
            dataSource: sourceLabel,
            proofSignature: proof.signature,
            metadata: {
              leverage,
              survivalTimeSeconds: Math.floor(elapsed / 1000),
              liquidationPrice: liqPrice,
              dangerLevel: live.dangerLevel,
            },
          });
        }

        playCue('liquidated');
        setOverlay({
          open: true,
          variant: 'liquidated',
          title: <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>LIQUIDATED <Skull size={28} /></span>,
          subtitle: `Danger spiked to ${live.dangerLevel}`,
          amountText: `-${betAmount.toFixed(4)} SOL`,
          details: <span>Move against position crossed {liquidationThreshold * 100}%.</span>,
          icon: <Skull size={64} />,
        });
      }
    }, TICK_INTERVAL);

    survivalRef.current = setInterval(() => {
      setSurvivalTime(prev => prev + 1);
    }, 1000);
  }, [
    betAmount,
    clearTimers,
    direction,
    leverage,
    liquidationThreshold,
    placeBet,
    playCue,
    recordProof,
    solMarket?.price,
    sourceLabel,
  ]);

  const cashOut = useCallback(() => {
    clearTimers();
    const winnings = betAmount + pnl;
    const finalPayout = Math.max(0, winnings);
    setPayout(finalPayout);
    if (finalPayout > 0) addWinnings(finalPayout);
    setGameState('cashed_out');

    const shouldRecord = !roundProofRecordedRef.current;
    roundProofRecordedRef.current = true;

    if (shouldRecord) {
      const proof = recordProof({
        asset: 'SOL',
        startPrice: entryPrice || currentPrice,
        endPrice: currentPrice,
        volatilityLevel: marketSnapshotRef.current.volatilityLevel,
        result: finalPayout > betAmount ? 'win' : 'loss',
        dataSource: 'Solana Mainnet Stream',
      });

      const movementPercent =
        (entryPrice || currentPrice) > 0
          ? ((currentPrice - (entryPrice || currentPrice)) / (entryPrice || currentPrice)) * 100
          : 0;
      void persistGameRound({
        game: 'liquidation',
        asset: 'SOL',
        direction: direction.toUpperCase(),
        betAmount,
        payoutAmount: finalPayout,
        result: finalPayout > betAmount ? 'win' : 'loss',
        startPrice: entryPrice || currentPrice,
        endPrice: currentPrice,
        movementPercent,
        volatilityLevel: marketSnapshotRef.current.volatilityLevel,
        dataSource: sourceLabel,
        proofSignature: proof.signature,
        metadata: {
          leverage,
          survivalTimeSeconds: survivalTime,
          liquidationPrice,
          dangerLevel: currentDangerLevel,
          pnl,
          pnlPercent,
        },
      });
    }

    if (finalPayout > betAmount) {
      playCue('win');
      setOverlay({
        open: true,
        variant: 'win',
        title: <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>POSITION WON <Rocket size={28} /></span>,
        subtitle: `Escaped while danger was ${currentDangerLevel}`,
        amountText: `+${(finalPayout - betAmount).toFixed(4)} SOL`,
        details: <span>{survivalTime}s survived • {pnlPercent.toFixed(1)}% return</span>,
        icon: <Rocket size={64} />,
      });
      return;
    }

    playCue('lose');
    setOverlay({
      open: true,
      variant: 'loss',
      title: 'CASHED OUT',
      subtitle: 'Position closed under pressure',
      amountText: `${(finalPayout - betAmount).toFixed(4)} SOL`,
      details: <span>{survivalTime}s survived • {currentDangerLevel} danger</span>,
      icon: <Wallet size={64} />,
    });
  }, [
    addWinnings,
    betAmount,
    clearTimers,
    currentDangerLevel,
    currentPrice,
    direction,
    entryPrice,
    leverage,
    liquidationPrice,
    playCue,
    pnl,
    pnlPercent,
    recordProof,
    sourceLabel,
    survivalTime,
  ]);

  const resetGame = useCallback(() => {
    clearTimers();
    setGameState('setup');
    setPriceHistory([]);
    setSurvivalTime(0);
    setPnl(0);
    setPnlPercent(0);
    setPayout(0);
    setOverlay(prev => ({ ...prev, open: false }));
  }, [clearTimers]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const chartPoints = useMemo<PricePoint[]>(() => {
    if (gameState === 'setup') {
      return liveTicks.slice(-40).map((tick, index) => ({
        price: tick.price,
        time: index * TICK_INTERVAL,
      }));
    }
    return priceHistory;
  }, [gameState, liveTicks, priceHistory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || chartPoints.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const prices = chartPoints.map(point => point.price);
    const minPrice = Math.min(...prices) * 0.9997;
    const maxPrice = Math.max(...prices) * 1.0003;
    const priceRange = maxPrice - minPrice || 1;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (gameState !== 'setup' && liquidationPrice > 0) {
      const liqY = height - ((liquidationPrice - minPrice) / priceRange) * height;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, liqY);
      ctx.lineTo(width, liqY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const isProfit = pnl >= 0;
    const lineColor = isProfit ? '#22c55e' : '#ef4444';
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (isProfit) {
      gradient.addColorStop(0, 'rgba(34, 197, 94, 0.24)');
      gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0.02)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0.26)');
    }

    ctx.beginPath();
    prices.forEach((price, index) => {
      const x = (index / Math.max(1, prices.length - 1)) * width;
      const y = height - ((price - minPrice) / priceRange) * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const lastX = width;
    const lastY = height - ((prices[prices.length - 1] - minPrice) / priceRange) * height;
    ctx.lineTo(lastX, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lastX, lastY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
  }, [chartPoints, gameState, liquidationPrice, pnl]);

  const distanceToLiquidationPercent = entryPrice > 0 && liquidationPrice > 0
    ? Math.abs((currentPrice - liquidationPrice) / entryPrice) * 100
    : liquidationThreshold * 100;
  const distanceRatio = liquidationThreshold > 0
    ? distanceToLiquidationPercent / (liquidationThreshold * 100)
    : 1;
  const dangerScore = getDangerScore(currentDangerLevel, distanceRatio);
  const countdownRemaining = Math.max(0, TARGET_SURVIVAL_SECONDS - survivalTime);
  const isCriticalPressure = gameState === 'playing' && (currentDangerLevel === 'CRITICAL' || distanceRatio < 0.35);
  const primaryActionLabel = gameState === 'playing'
    ? `Cash Out ${(betAmount + pnl).toFixed(4)} SOL`
    : 'Open Position';

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`game-page-wide ${styles.shell}`}>
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
            <span>{gameState === 'playing' ? 'Round Live' : 'Market Live'}</span>
          </div>
          <div className={styles.techRow}>
            <span>{sourceLabel}</span>
            <span>{solMarket?.volatilityLevel ?? 'LOW'} Vol</span>
          </div>
        </div>

        <div className={`${styles.priceBoard} ${solMarket?.direction === 'up' ? styles.priceUp : solMarket?.direction === 'down' ? styles.priceDown : styles.priceFlat}`}>
          <span className={styles.assetLabel}>SOL / USD</span>
          <strong className={styles.priceValue}>${formatPrice(gameState === 'playing' ? currentPrice : (solMarket?.price ?? 0))}</strong>
          <span className={styles.priceMeta}>{solMarket?.mood ?? 'Market Calm'} • Danger {currentDangerLevel}</span>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span>Survival target</span>
            <strong>{formatTime(countdownRemaining)}</strong>
            <small>Beat the clock or cash out sooner</small>
          </div>
          <div className={styles.heroStat}>
            <span>Liquidation move</span>
            <strong>{(liquidationThreshold * 100).toFixed(1)}%</strong>
            <small>Against your position</small>
          </div>
          <div className={`${styles.heroStat} ${dangerClass(currentDangerLevel)}`}>
            <span>Danger</span>
            <strong>{currentDangerLevel}</strong>
            <small>{distanceToLiquidationPercent.toFixed(2)}% from liquidation</small>
          </div>
        </div>
      </section>

      <section className={`${styles.liveSurface} ${isCriticalPressure ? styles.surfaceDanger : ''}`}>
        <div className={styles.chartHeader}>
          <div>
            <span className={styles.sectionLabel}>Live Price Path</span>
            <strong>{gameState === 'playing' ? 'Position under pressure' : 'Warm-up before entry'}</strong>
          </div>
          <div className={styles.chartMeta}>
            <span>{direction === 'long' ? 'LONG' : 'SHORT'}</span>
            <span>{leverage}x</span>
          </div>
        </div>

        <div className={styles.chartShell}>
          <canvas ref={canvasRef} className={styles.chart} />
          {chartPoints.length < 2 ? <div className={styles.chartLoading}>Streaming market ticks…</div> : null}
        </div>

        <div className={styles.dangerMeterCard}>
          <div className={styles.dangerMeterHeader}>
            <span className={styles.sectionLabel}>Danger Meter</span>
            <strong>{dangerScore.toFixed(0)}%</strong>
          </div>
          <div className={styles.dangerTrack}>
            <div className={`${styles.dangerFill} ${dangerClass(currentDangerLevel)}`} style={{ width: `${dangerScore}%` }} />
          </div>
          <div className={styles.dangerMetaRow}>
            <span>{currentDangerLevel}</span>
            <span>{distanceToLiquidationPercent.toFixed(2)}% buffer</span>
          </div>
        </div>
      </section>

      <section className={styles.controlsCard}>
        <div className={styles.controlGroup}>
          <span className={styles.sectionLabel}>Direction</span>
          <div className={styles.directionGrid}>
            <button
              className={`${styles.directionBtn} ${direction === 'long' ? styles.directionBtnLong : ''}`}
              onClick={() => {
                unlockAudio();
                playCue('click');
                setDirection('long');
              }}
              disabled={gameState === 'playing'}
            >
              <TrendingUp size={18} />
              <span>UP / LONG</span>
            </button>
            <button
              className={`${styles.directionBtn} ${direction === 'short' ? styles.directionBtnShort : ''}`}
              onClick={() => {
                unlockAudio();
                playCue('click');
                setDirection('short');
              }}
              disabled={gameState === 'playing'}
            >
              <TrendingDown size={18} />
              <span>DOWN / SHORT</span>
            </button>
          </div>
        </div>

        <div className={styles.controlGroup}>
          <div className={styles.sliderHeader}>
            <span className={styles.sectionLabel}>Leverage</span>
            <strong>{leverage}x</strong>
          </div>
          <input
            className={styles.slider}
            type="range"
            min={0}
            max={LEVERAGE_OPTIONS.length - 1}
            step={1}
            value={Math.max(0, leverageIndex)}
            onChange={(event) => {
              unlockAudio();
              setLeverage(LEVERAGE_OPTIONS[Number(event.target.value)] ?? 10);
            }}
            disabled={gameState === 'playing'}
          />
          <div className={styles.sliderTicks}>
            {LEVERAGE_OPTIONS.map(value => (
              <span key={value} className={value === leverage ? styles.sliderTickActive : ''}>{value}x</span>
            ))}
          </div>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.sectionLabel}>Position Size</span>
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
                disabled={gameState === 'playing'}
              >
                {preset.toFixed(2)} SOL
              </button>
            ))}
          </div>
        </div>

        <div className={styles.actionRow}>
          {gameState === 'setup' ? (
            <button
              className={`${styles.primaryBtn} ${styles.primaryBtnHot}`}
              onClick={() => {
                unlockAudio();
                playCue('click');
                void startGame();
              }}
              disabled={betAmount <= 0 || betAmount > balance}
            >
              <span className={styles.buttonGlow} />
              <span className={styles.buttonText}><Zap size={20} /> {primaryActionLabel}</span>
            </button>
          ) : gameState === 'playing' ? (
            <button
              className={`${styles.primaryBtn} ${styles.primaryBtnCashout}`}
              onClick={() => {
                unlockAudio();
                playCue('click');
                cashOut();
              }}
            >
              <span className={styles.buttonGlow} />
              <span className={styles.buttonText}><Wallet size={20} /> {primaryActionLabel}</span>
            </button>
          ) : (
            <button
              className={`${styles.primaryBtn} ${styles.primaryBtnHot}`}
              onClick={() => {
                unlockAudio();
                playCue('click');
                resetGame();
              }}
            >
              <span className={styles.buttonGlow} />
              <span className={styles.buttonText}><TimerReset size={20} /> Play Again</span>
            </button>
          )}
        </div>
      </section>

      <section className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <span className={styles.sectionLabel}>Entry</span>
          <strong>${formatPrice(entryPrice || (solMarket?.price ?? 0))}</strong>
        </div>
        <div className={styles.statusCard}>
          <span className={styles.sectionLabel}>Current</span>
          <strong className={pnl >= 0 ? styles.textGreen : styles.textRed}>${formatPrice(gameState === 'playing' ? currentPrice : (solMarket?.price ?? 0))}</strong>
        </div>
        <div className={styles.statusCard}>
          <span className={styles.sectionLabel}>Timer</span>
          <strong>{gameState === 'playing' ? formatTime(countdownRemaining) : formatTime(TARGET_SURVIVAL_SECONDS)}</strong>
        </div>
        <div className={styles.statusCard}>
          <span className={styles.sectionLabel}>PnL</span>
          <strong className={pnl >= 0 ? styles.textGreen : styles.textRed}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(4)} SOL</strong>
        </div>
      </section>

      {(gameState === 'playing' || gameState === 'liquidated' || gameState === 'cashed_out') ? (
        <section className={`${styles.feedbackCard} ${gameState === 'liquidated' ? styles.feedbackLoss : gameState === 'cashed_out' && payout > betAmount ? styles.feedbackWin : ''}`}>
          <div className={styles.feedbackHeader}>
            <div>
              <span className={styles.sectionLabel}>Round Feedback</span>
              <strong>
                {gameState === 'playing'
                  ? 'Stay alive and cash out at the right moment'
                  : gameState === 'liquidated'
                    ? 'Liquidated'
                    : payout > betAmount
                      ? 'Cashed out in profit'
                      : 'Cashed out flat / down'}
              </strong>
            </div>
            <Activity size={22} />
          </div>
          <p>
            {gameState === 'playing'
              ? `${direction === 'long' ? 'Long' : 'Short'} ${leverage}x • ${survivalTime}s survived • ${currentDangerLevel} danger`
              : gameState === 'liquidated'
                ? `Position was closed at ${formatPrice(currentPrice)} after ${formatTime(survivalTime)}.`
                : `Final payout ${payout.toFixed(4)} SOL after ${formatTime(survivalTime)}.`}
          </p>
        </section>
      ) : null}

      {(gameState === 'liquidated' || gameState === 'cashed_out') ? (
        <ProofPanel proof={latestProof} history={proofHistory} />
      ) : null}
    </div>
  );
}
