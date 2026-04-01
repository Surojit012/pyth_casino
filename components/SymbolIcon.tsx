import React, { type CSSProperties } from 'react';
import { Bitcoin, Gem, Diamond, Rocket, Flame, Zap, HelpCircle } from 'lucide-react';
import styles from './SymbolIcon.module.css';

interface SymbolIconProps {
  symbol: string;
  className?: string;
  size?: number | string;
}

export const SymbolIcon: React.FC<SymbolIconProps> = ({ symbol, className, size }) => {
  const normalized = symbol.toLowerCase();
  const pixelSize = typeof size === 'number' ? size : Number.parseInt(String(size ?? 56), 10) || 56;
  const wrapperClassName = [styles.icon, className].filter(Boolean).join(' ');
  const iconStyle = { ['--symbol-size' as const]: `${pixelSize}px` } as CSSProperties;
  const glyphSize = Math.max(18, Math.round(pixelSize * 0.52));

  const coinClass = [wrapperClassName, styles.coin].join(' ');
  const tileClass = [wrapperClassName, styles.tile].join(' ');
  const glyphClass = styles.glyph;

  switch (normalized) {
    case 'btc':
      return (
        <span className={[coinClass, styles.btc].join(' ')} style={iconStyle} aria-label="Bitcoin symbol">
          <Bitcoin className={glyphClass} size={glyphSize} />
        </span>
      );
    case 'eth':
      return (
        <span className={[coinClass, styles.eth].join(' ')} style={iconStyle} aria-label="Ethereum symbol">
          <Gem className={glyphClass} size={glyphSize} />
        </span>
      );
    case 'sol':
      return (
        <span className={[tileClass, styles.sol].join(' ')} style={iconStyle} aria-label="Solana symbol">
          <span className={styles.solBars} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </span>
      );
    case 'pyth':
      return (
        <span className={[tileClass, styles.pyth].join(' ')} style={iconStyle} aria-label="Pyth symbol">
          <span className={styles.label}>PY</span>
        </span>
      );
    case 'diamond':
      return (
        <span className={[coinClass, styles.diamond].join(' ')} style={iconStyle} aria-label="Diamond symbol">
          <Diamond className={glyphClass} size={glyphSize} />
        </span>
      );
    case 'rocket':
      return (
        <span className={[tileClass, styles.rocket].join(' ')} style={iconStyle} aria-label="Rocket symbol">
          <Rocket className={glyphClass} size={glyphSize} />
        </span>
      );
    case 'fire':
      return (
        <span className={[coinClass, styles.fire].join(' ')} style={iconStyle} aria-label="Fire symbol">
          <Flame className={glyphClass} size={glyphSize} />
        </span>
      );
    case 'lightning':
      return (
        <span className={[tileClass, styles.lightning].join(' ')} style={iconStyle} aria-label="Lightning symbol">
          <Zap className={glyphClass} size={glyphSize} />
        </span>
      );
    case 'slot':
      return (
        <span className={[tileClass, styles.slot].join(' ')} style={iconStyle} aria-label="NFT slot symbol">
          <span className={styles.nftEyes} aria-hidden="true" />
        </span>
      );
    default:
      return (
        <span className={wrapperClassName} style={iconStyle} aria-label="Unknown symbol">
          <HelpCircle className={glyphClass} size={glyphSize} />
        </span>
      );
  }
};
