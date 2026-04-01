use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("9C2rBMBfZXDpPXtMdMiKs6cGjZjHujDEoVKmie6KRLJN");

/// ── Trusted addresses ──────────────────────────────────────────────────────
/// Pyth BTC/USD price feed on devnet.
const PYTH_BTC_PRICE_FEED: Pubkey = pubkey!("HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J");

/// Treasury vault PDA seed. The vault is derived as a PDA so the program
/// can sign payout transfers without holding a private key.
const VAULT_SEED: &[u8] = b"vault";

/// ── Timing constraints ─────────────────────────────────────────────────────
/// Minimum seconds before a bet can be resolved (prevents instant self-resolve).
const MIN_RESOLVE_DELAY_SECS: i64 = 60;
/// Maximum seconds a bet stays open. After this window it can no longer be resolved.
const MAX_RESOLVE_WINDOW_SECS: i64 = 300;

/// Payout multiplier numerator / denominator (1.9x = 190/100).
const PAYOUT_NUMERATOR: u64 = 190;
const PAYOUT_DENOMINATOR: u64 = 100;

#[program]
pub mod pyth_roulette {
    use super::*;

    pub fn place_bet(ctx: Context<PlaceBet>, amount: u64, direction: bool) -> Result<()> {
        require!(amount > 0, RouletteError::ZeroBetAmount);

        // Transfer bet SOL from user → vault PDA.
        let cpi_accounts = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
        transfer(cpi_ctx, amount)?;

        let start_price = read_pyth_price(&ctx.accounts.pyth_btc_price.to_account_info())?;
        let clock = Clock::get()?;

        let bet = &mut ctx.accounts.bet;
        bet.player = ctx.accounts.user.key();
        bet.amount = amount;
        bet.direction = direction;
        bet.resolved = false;
        bet.won = false;
        bet.start_price = start_price;
        bet.end_price = 0;
        bet.placed_at = clock.unix_timestamp;
        Ok(())
    }

    pub fn resolve_bet(ctx: Context<ResolveBet>) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        let clock = Clock::get()?;

        require!(!bet.resolved, RouletteError::BetAlreadyResolved);
        require_keys_eq!(bet.player, ctx.accounts.user.key(), RouletteError::UnauthorizedResolver);

        // ── Time-lock: enforce resolution window ─────────────────────────
        let elapsed = clock.unix_timestamp.saturating_sub(bet.placed_at);
        require!(
            elapsed >= MIN_RESOLVE_DELAY_SECS,
            RouletteError::TooEarlyToResolve
        );
        require!(
            elapsed <= MAX_RESOLVE_WINDOW_SECS,
            RouletteError::ResolutionWindowExpired
        );

        let end_price = read_pyth_price(&ctx.accounts.pyth_btc_price.to_account_info())?;
        let start_price = bet.start_price;

        // UP wins when market rises, DOWN wins when market falls.
        let won = if end_price > start_price {
            bet.direction
        } else if end_price < start_price {
            !bet.direction
        } else {
            false
        };

        bet.end_price = end_price;
        bet.won = won;
        bet.resolved = true;

        // ── Payout: transfer winnings from vault PDA → player ────────────
        if won {
            let payout = bet
                .amount
                .checked_mul(PAYOUT_NUMERATOR)
                .and_then(|v| v.checked_div(PAYOUT_DENOMINATOR))
                .ok_or(RouletteError::PayoutOverflow)?;

            let vault_balance = ctx.accounts.vault.lamports();
            let actual_payout = payout.min(vault_balance);

            if actual_payout > 0 {
                let bump = ctx.bumps.vault;
                let seeds: &[&[u8]] = &[VAULT_SEED, &[bump]];
                let signer_seeds = &[seeds];

                let payout_accounts = Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user.to_account_info(),
                };
                let payout_ctx = CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    payout_accounts,
                    signer_seeds,
                );
                transfer(payout_ctx, actual_payout)?;
            }
        }

        emit!(BetResolved {
            player: bet.player,
            won,
            direction: bet.direction,
            start_price,
            end_price,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(init, payer = user, space = 8 + Bet::INIT_SPACE)]
    pub bet: Account<'info, Bet>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// Vault PDA — derived from VAULT_SEED. Only the program can sign transfers out.
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    /// Pyth BTC/USD price feed — pinned to trusted devnet address.
    /// CHECK: Validated by address constraint AND read_pyth_price internal checks.
    #[account(address = PYTH_BTC_PRICE_FEED @ RouletteError::InvalidPythPriceFeed)]
    pub pyth_btc_price: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveBet<'info> {
    #[account(mut)]
    pub bet: Account<'info, Bet>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// Vault PDA — same seed derivation for payout transfers.
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    /// Pyth BTC/USD price feed — same pinned address for resolution.
    /// CHECK: Validated by address constraint AND read_pyth_price internal checks.
    #[account(address = PYTH_BTC_PRICE_FEED @ RouletteError::InvalidPythPriceFeed)]
    pub pyth_btc_price: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub player: Pubkey,
    pub amount: u64,
    pub direction: bool,
    pub resolved: bool,
    pub won: bool,
    pub start_price: i64,
    pub end_price: i64,
    /// Unix timestamp when the bet was placed — used for time-lock enforcement.
    pub placed_at: i64,
}

#[event]
pub struct BetResolved {
    pub player: Pubkey,
    pub won: bool,
    pub direction: bool,
    pub start_price: i64,
    pub end_price: i64,
}

fn read_pyth_price(account_info: &AccountInfo) -> Result<i64> {
    const PYTH_MAGIC: u32 = 0xa1b2c3d4;
    const PRICE_ACCOUNT_TYPE: u32 = 3;
    const OFFSET_MAGIC: usize = 0;
    const OFFSET_ACCOUNT_TYPE: usize = 8;
    const OFFSET_AGG_PRICE: usize = 208;
    const OFFSET_AGG_STATUS: usize = 224;

    let data = account_info.try_borrow_data()?;
    require!(
        data.len() > OFFSET_AGG_STATUS + 4,
        RouletteError::InvalidPythPriceFeed
    );

    let magic = u32::from_le_bytes(
        data[OFFSET_MAGIC..OFFSET_MAGIC + 4]
            .try_into()
            .map_err(|_| error!(RouletteError::InvalidPythPriceFeed))?,
    );
    require!(magic == PYTH_MAGIC, RouletteError::InvalidPythPriceFeed);

    let account_type = u32::from_le_bytes(
        data[OFFSET_ACCOUNT_TYPE..OFFSET_ACCOUNT_TYPE + 4]
            .try_into()
            .map_err(|_| error!(RouletteError::InvalidPythPriceFeed))?,
    );
    require!(
        account_type == PRICE_ACCOUNT_TYPE,
        RouletteError::InvalidPythPriceFeed
    );

    let status = u32::from_le_bytes(
        data[OFFSET_AGG_STATUS..OFFSET_AGG_STATUS + 4]
            .try_into()
            .map_err(|_| error!(RouletteError::InvalidPythPriceFeed))?,
    );
    require!(status != 0, RouletteError::InvalidPythPriceFeed);

    let price = i64::from_le_bytes(
        data[OFFSET_AGG_PRICE..OFFSET_AGG_PRICE + 8]
            .try_into()
            .map_err(|_| error!(RouletteError::InvalidPythPriceFeed))?,
    );
    Ok(price)
}

#[error_code]
pub enum RouletteError {
    #[msg("Bet is already resolved")]
    BetAlreadyResolved,
    #[msg("Only the bet owner can resolve this bet")]
    UnauthorizedResolver,
    #[msg("Invalid Pyth BTC price feed account")]
    InvalidPythPriceFeed,
    #[msg("Bet amount must be greater than zero")]
    ZeroBetAmount,
    #[msg("Too early to resolve — must wait at least 60 seconds after placing")]
    TooEarlyToResolve,
    #[msg("Resolution window expired — bet must be resolved within 5 minutes")]
    ResolutionWindowExpired,
    #[msg("Payout calculation overflowed")]
    PayoutOverflow,
}
