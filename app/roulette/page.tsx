'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CircleDot, Sparkles, Target } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useLiveBets } from '@/context/LiveBetsContext';
import { useMarketData } from '@/context/MarketDataContext';
import { useSound } from '@/context/SoundContext';
import { useGameProof } from '@/context/ProofContext';
import { formatPrice } from '@/lib/pyth';
import { persistGameRound } from '@/lib/clientGameRounds';
import { getRoulettePayoutMultiplier } from '@/lib/volatility';
import ResultOverlay from '@/components/ResultOverlay';
import ProofPanel from '@/components/ProofPanel';
import Toast from '@/components/Toast';
import styles from './page.module.css';

type BetDirection = 'up' | 'down';
type RoundState = 'idle' | 'locked' | 'resolved';

interface OverlayState {
  open: boolean;
  variant: 'win' | 'loss';
  title: React.ReactNode;
  subtitle: string;
  amountText?: string;
  details?: React.ReactNode;
  icon?: React.ReactNode;
}

interface RoundSummary {
  direction: 'UP' | 'DOWN';
  amountSol: number;
  startPrice: number;
  endPrice: number;
  payoutMultiplier: number;
  totalPayout: number;
  movementPercent: number;
  isWin: boolean;
}

const ROUND_DURATION_MS = 12000;
const QUICK_BETS = [0.01, 0.05, 0.1];

function formatDirection(direction: BetDirection) {
  return direction === 'up' ? 'UP' : 'DOWN';
}

export default function RoulettePage() {
  const { balance, placeBet, addWinnings } = useWallet();
  const { addPendingBet, confirmBet } = useLiveBets();
  const { current: solMarket, sourceLabel } = useMarketData('SOL');
  const { unlockAudio, playCue } = useSound();
  const { latestProof, proofHistory, recordProof } = useGameProof('roulette');

  const [direction, setDirection] = useState<BetDirection>('up');
  const [amountSol, setAmountSol] = useState(0.05);
  const [roundState, setRoundState] = useState<RoundState>('idle');
  const [statusText, setStatusText] = useState('Choose a side, pick an amount, and bet.');
  const [roundStartedAt, setRoundStartedAt] = useState<number | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState(ROUND_DURATION_MS);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [overlay, setOverlay] = useState<OverlayState>({
    open: false,
    variant: 'loss',
    title: '',
    subtitle: '',
  });
  const [lastRound, setLastRound] = useState<RoundSummary | null>(null);

  const latestPriceRef = useRef(solMarket?.price ?? 0);
  const resolveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    latestPriceRef.current = solMarket?.price ?? latestPriceRef.current;
  }, [solMarket?.price]);

  useEffect(() => {
    return () => {
      if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (roundState !== 'locked' || !roundStartedAt) {
      setTimeLeftMs(ROUND_DURATION_MS);
      return;
    }

    const timer = setInterval(() => {
      const nextLeft = Math.max(0, ROUND_DURATION_MS - (Date.now() - roundStartedAt));
      setTimeLeftMs(nextLeft);
    }, 100);

    return () => clearInterval(timer);
  }, [roundState, roundStartedAt]);

  const showToast = useCallback((message: string) => {
    setToastOpen(false);
    setToastMessage(message);
    setTimeout(() => setToastOpen(true), 0);
  }, []);

  const liveVolatilityLevel = solMarket?.volatilityLevel ?? 'LOW';
  const payoutMultiplier = useMemo(
    () => getRoulettePayoutMultiplier(liveVolatilityLevel),
    [liveVolatilityLevel]
  );
  const previewProfit = Math.max(0, amountSol * payoutMultiplier - amountSol);
  const progress = roundState === 'locked' ? timeLeftMs / ROUND_DURATION_MS : 1;
  const timeLabel = roundState === 'locked' ? Math.max(1, Math.ceil(timeLeftMs / 1000)) : 12;
  const liveDirectionText = direction === 'up' ? 'UP' : 'DOWN';
  const priceToneClass =
    solMarket?.direction === 'up'
      ? styles.priceUp
      : solMarket?.direction === 'down'
        ? styles.priceDown
        : styles.priceFlat;

  const closeOverlay = useCallback(() => {
    setOverlay((prev) => ({ ...prev, open: false }));
  }, []);

  const handlePlaceBet = useCallback(async () => {
    if (roundState === 'locked') return;

    const livePrice = latestPriceRef.current || solMarket?.price || 0;
    if (!livePrice || !Number.isFinite(livePrice)) {
      setStatusText('Live price is still syncing. Try again in a moment.');
      showToast('Live price is still syncing.');
      return;
    }

    if (!Number.isFinite(amountSol) || amountSol <= 0) {
      setStatusText('Pick a valid amount before betting.');
      showToast('Pick a valid amount.');
      return;
    }

    const betAccepted = await placeBet(amountSol);
    if (!betAccepted) {
      setStatusText('Your app balance is too low for this bet.');
      showToast('Not enough balance.');
      return;
    }

    unlockAudio();
    playCue('click');
    closeOverlay();
    setRoundState('locked');
    setRoundStartedAt(Date.now());
    setStatusText(`Bet locked. Watching SOL for ${ROUND_DURATION_MS / 1000} seconds.`);

    const roundStartPrice = livePrice;
    const roundDirection = direction;
    const roundAmount = amountSol;
    const roundVolatility = liveVolatilityLevel;
    const roundPayoutMultiplier = getRoulettePayoutMultiplier(roundVolatility);
    const liveBetId = addPendingBet({
      wallet: 'casino-player',
      direction: formatDirection(roundDirection),
      amountSol: roundAmount,
    });

    resolveTimeoutRef.current = setTimeout(async () => {
      const endPrice = latestPriceRef.current || roundStartPrice;
      const isWin =
        roundDirection === 'up' ? endPrice > roundStartPrice : endPrice < roundStartPrice;
      const totalPayout = isWin ? Number((roundAmount * roundPayoutMultiplier).toFixed(4)) : 0;
      const movementPercent =
        roundStartPrice > 0 ? ((endPrice - roundStartPrice) / roundStartPrice) * 100 : 0;
      const movementText = `${movementPercent >= 0 ? '+' : ''}${movementPercent.toFixed(2)}%`;

      if (isWin) {
        await addWinnings(totalPayout);
        playCue('win');
        setOverlay({
          open: true,
          variant: 'win',
          title: 'WIN',
          subtitle: 'Your market call landed.',
          amountText: `+${totalPayout.toFixed(4)} SOL`,
          details: (
            <>
              <div>
                <span>Move</span>
                <strong>{movementText}</strong>
              </div>
              <div>
                <span>Exit Price</span>
                <strong>${formatPrice(endPrice)}</strong>
              </div>
            </>
          ),
          icon: <Target size={64} />,
        });
      } else {
        playCue('lose');
        setOverlay({
          open: true,
          variant: 'loss',
          title: 'LOSS',
          subtitle: 'The market moved the other way.',
          amountText: `-${roundAmount.toFixed(4)} SOL`,
          details: (
            <>
              <div>
                <span>Move</span>
                <strong>{movementText}</strong>
              </div>
              <div>
                <span>Exit Price</span>
                <strong>${formatPrice(endPrice)}</strong>
              </div>
            </>
          ),
          icon: <Sparkles size={64} />,
        });
      }

      setRoundState('resolved');
      setStatusText(isWin ? 'Nice call. Balance updated instantly.' : 'Round closed. Ready for the next bet.');

      confirmBet(liveBetId, `roulette-${Date.now()}`);
      const proof = recordProof({
        asset: 'SOL',
        startPrice: roundStartPrice,
        endPrice,
        volatilityLevel: roundVolatility,
        result: isWin ? 'win' : 'loss',
        dataSource: sourceLabel,
      });

      void persistGameRound({
        game: 'roulette',
        asset: 'SOL',
        direction: formatDirection(roundDirection),
        betAmount: roundAmount,
        payoutAmount: totalPayout,
        result: isWin ? 'win' : 'loss',
        startPrice: roundStartPrice,
        endPrice,
        movementPercent,
        volatilityLevel: roundVolatility,
        dataSource: sourceLabel,
        proofSignature: proof.signature,
        metadata: {
          payoutMultiplier: roundPayoutMultiplier,
          roundDurationMs: ROUND_DURATION_MS,
        },
      });

      setLastRound({
        direction: formatDirection(roundDirection),
        amountSol: roundAmount,
        startPrice: roundStartPrice,
        endPrice,
        payoutMultiplier: roundPayoutMultiplier,
        totalPayout,
        movementPercent,
        isWin,
      });

      showToast(
        isWin
          ? `Roulette win • +${totalPayout.toFixed(4)} SOL`
          : `Roulette loss • ${movementPercent.toFixed(2)}% move`
      );

      setTimeout(() => setRoundState('idle'), 450);
    }, ROUND_DURATION_MS);
  }, [
    addPendingBet,
    addWinnings,
    amountSol,
    closeOverlay,
    confirmBet,
    direction,
    liveVolatilityLevel,
    placeBet,
    playCue,
    recordProof,
    roundState,
    showToast,
    solMarket?.price,
    sourceLabel,
    unlockAudio,
  ]);

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
        ctaLabel="Play Again"
        onAction={closeOverlay}
        autoHideMs={3600}
        onComplete={closeOverlay}
      />

      <section className={styles.hero}>
        <div className={styles.liveBar}>
          <div className={styles.liveIndicator}>
            <span className={styles.liveDot} />
            <span>LIVE</span>
          </div>
          <div className={styles.techLabels}>
            <span>{solMarket?.mood ?? 'Market Calm'}</span>
            <span>Vol {solMarket?.volatilityLevel ?? 'LOW'}</span>
          </div>
        </div>

        <div className={`${styles.priceBoard} ${priceToneClass}`}>
          <span className={styles.assetLabel}>SOL / USD</span>
          <strong className={styles.priceValue}>${formatPrice(solMarket?.price ?? 0)}</strong>
          <span className={styles.priceChange}>
            {solMarket?.change15s !== undefined ? `${solMarket.change15s >= 0 ? '+' : ''}${solMarket.change15s.toFixed(2)}%` : '0.00%'}
          </span>
        </div>

        <div className={styles.roundRow}>
          <div className={styles.previewCard}>
            <span>If {liveDirectionText} wins</span>
            <strong>+{previewProfit.toFixed(4)} SOL</strong>
            <small>{payoutMultiplier.toFixed(2)}x payout</small>
          </div>

          <div className={styles.timerCard}>
            <div className={styles.timerShell}>
              <div className={styles.timerMeta}>
                <span className={styles.timerKicker}>Round Clock</span>
                <strong>{roundState === 'locked' ? 'Live Round' : 'Resetting'}</strong>
              </div>

              <div
                className={styles.timerRing}
                style={{ '--progress': `${Math.max(0, Math.min(1, progress))}` } as React.CSSProperties}
              >
                <div className={styles.timerInner}>
                  <strong>{timeLabel}</strong>
                  <span>sec</span>
                </div>
              </div>

              <div className={styles.timerReadout}>
                <span>{roundState === 'locked' ? 'Closes in' : 'Next round in'}</span>
                <strong>{timeLabel}s</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.betCard}>
        <div className={styles.stepRow}>
          <div className={styles.stepTitle}>
            <span>1</span>
            <p>Choose direction</p>
          </div>
          <div className={styles.directionGrid}>
            <button
              className={`${styles.directionBtn} ${styles.upBtn} ${direction === 'up' ? styles.directionActive : ''} micro-press`}
              onClick={() => {
                unlockAudio();
                playCue('click');
                setDirection('up');
              }}
            >
              <ArrowUp size={18} />
              <strong>UP</strong>
            </button>
            <button
              className={`${styles.directionBtn} ${styles.downBtn} ${direction === 'down' ? styles.directionActive : ''} micro-press`}
              onClick={() => {
                unlockAudio();
                playCue('click');
                setDirection('down');
              }}
            >
              <ArrowDown size={18} />
              <strong>DOWN</strong>
            </button>
          </div>
        </div>

        <div className={styles.stepRow}>
          <div className={styles.stepTitle}>
            <span>2</span>
            <p>Select amount</p>
          </div>
          <div className={styles.amountWrap}>
            <div className={styles.amountHeader}>
              <span>Balance</span>
              <strong>{balance.toFixed(4)} SOL</strong>
            </div>
            <input
              id="bet-amount"
              type="number"
              min="0.001"
              step="0.001"
              value={amountSol}
              className={styles.amountInput}
              onChange={(event) => {
                const raw = Number(event.target.value);
                if (!Number.isFinite(raw)) return;
                setAmountSol(Math.max(0, raw));
              }}
            />
            <div className={styles.quickBets}>
              {QUICK_BETS.map((quickAmount) => (
                <button
                  key={quickAmount}
                  className={`${styles.quickBetBtn} ${Math.abs(amountSol - quickAmount) < 0.0001 ? styles.quickBetActive : ''} micro-press`}
                  onClick={() => {
                    unlockAudio();
                    playCue('click');
                    setAmountSol(quickAmount);
                  }}
                >
                  {quickAmount.toFixed(2)} SOL
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.stepRow}>
          <div className={styles.stepTitle}>
            <span>3</span>
            <p>Click bet</p>
          </div>
          <button
            className={`${styles.betButton} micro-press`}
            onClick={() => void handlePlaceBet()}
            disabled={roundState === 'locked' || !Number.isFinite(amountSol) || amountSol <= 0}
          >
            {roundState === 'locked' ? 'Round Live' : 'Place Bet'}
          </button>
        </div>
      </section>

      <section className={styles.footerRow}>
        <div className={styles.statusChip}>
          <CircleDot size={14} />
          <span>{statusText}</span>
        </div>

        {lastRound ? (
          <div className={styles.lastRound}>
            <span>Last</span>
            <strong>{lastRound.isWin ? `+${lastRound.totalPayout.toFixed(4)} SOL` : `-${lastRound.amountSol.toFixed(4)} SOL`}</strong>
            <small>{lastRound.direction} • {lastRound.movementPercent >= 0 ? '+' : ''}{lastRound.movementPercent.toFixed(2)}%</small>
          </div>
        ) : null}
      </section>

      <ProofPanel proof={latestProof} history={proofHistory} />

      <Toast open={toastOpen} message={toastMessage} onClose={() => setToastOpen(false)} />
    </div>
  );
}
