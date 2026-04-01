use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use pyth_sdk_solana::load_price_feed_from_account_info;

declare_id!("Fg6PaFpoGXkYsidMpWxTWqkZP2fYh9fJgYkq3P8fA6w");

#[program]
pub mod pyth_roulette {
    use super::*;

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        bet_id: u64,
        amount_lamports: u64,
        direction: u8,
    ) -> Result<()> {
        require!(amount_lamports > 0, RouletteError::InvalidAmount);
        require!(direction <= 1, RouletteError::InvalidDirection);

        let entry_price = read_btc_price(&ctx.accounts.pyth_btc_price)?;

        let bet = &mut ctx.accounts.bet;
        bet.player = ctx.accounts.player.key();
        bet.amount_lamports = amount_lamports;
        bet.direction = direction;
        bet.entry_price = entry_price;
        bet.resolved = false;
        bet.won = false;
        bet.bet_id = bet_id;
        bet.bump = ctx.bumps.bet;
        bet.created_at = Clock::get()?.unix_timestamp;
        bet.exit_price = None;
        bet.resolved_at = None;

        if ctx.accounts.vault.bump == 0 {
            ctx.accounts.vault.bump = ctx.bumps.vault;
        }

        // Escrow: lock player funds inside the program-owned vault PDA.
        let cpi_accounts = Transfer {
            from: ctx.accounts.player.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.system_program.to_account_info();
        transfer(
            CpiContext::new(cpi_program, cpi_accounts),
            amount_lamports,
        )?;

        Ok(())
    }

    pub fn resolve_bet(ctx: Context<ResolveBet>, _bet_id: u64) -> Result<()> {
        let bet = &mut ctx.accounts.bet;

        require!(!bet.resolved, RouletteError::BetAlreadyResolved);
        require_keys_eq!(
            bet.player,
            ctx.accounts.player.key(),
            RouletteError::InvalidPlayer
        );

        let exit_price = read_btc_price(&ctx.accounts.pyth_btc_price)?;
        let player_won = match bet.direction {
            0 => exit_price > bet.entry_price, // UP
            _ => exit_price < bet.entry_price, // DOWN
        };

        bet.resolved = true;
        bet.won = player_won;
        bet.exit_price = Some(exit_price);
        bet.resolved_at = Some(Clock::get()?.unix_timestamp);

        if player_won {
            // Demo payout model: winner receives 2x from vault escrow pool.
            let payout = bet
                .amount_lamports
                .checked_mul(2)
                .ok_or(RouletteError::MathOverflow)?;

            let vault_info = ctx.accounts.vault.to_account_info();
            let player_info = ctx.accounts.player.to_account_info();
            let vault_balance = **vault_info.lamports.borrow();
            require!(
                vault_balance >= payout,
                RouletteError::InsufficientVaultBalance
            );

            **vault_info.try_borrow_mut_lamports()? -= payout;
            **player_info.try_borrow_mut_lamports()? += payout;
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(bet_id: u64)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        init,
        payer = player,
        space = 8 + Bet::LEN,
        seeds = [b"bet", player.key().as_ref(), &bet_id.to_le_bytes()],
        bump
    )]
    pub bet: Account<'info, Bet>,

    #[account(
        init_if_needed,
        payer = player,
        space = 8 + Vault::LEN,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: Pyth account is validated by `pyth-sdk-solana`.
    pub pyth_btc_price: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bet_id: u64)]
pub struct ResolveBet<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bet", player.key().as_ref(), &bet_id.to_le_bytes()],
        bump = bet.bump,
        has_one = player
    )]
    pub bet: Account<'info, Bet>,

    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    /// CHECK: Pyth account is validated by `pyth-sdk-solana`.
    pub pyth_btc_price: AccountInfo<'info>,
}

#[account]
pub struct Bet {
    pub player: Pubkey,
    pub amount_lamports: u64,
    pub direction: u8, // 0 = UP, 1 = DOWN
    pub entry_price: i64,
    pub resolved: bool,
    pub won: bool,
    pub bet_id: u64,
    pub bump: u8,
    pub created_at: i64,
    pub exit_price: Option<i64>,
    pub resolved_at: Option<i64>,
}

impl Bet {
    pub const LEN: usize = 128;
}

#[account]
pub struct Vault {
    pub bump: u8,
}

impl Vault {
    pub const LEN: usize = 8;
}

fn read_btc_price(price_account: &AccountInfo) -> Result<i64> {
    let price_feed = load_price_feed_from_account_info(price_account)
        .map_err(|_| error!(RouletteError::InvalidPythPriceAccount))?;
    let clock = Clock::get()?;
    let current_price = price_feed
        .get_price_no_older_than(clock.unix_timestamp, 60)
        .ok_or_else(|| error!(RouletteError::StalePrice))?;

    Ok(current_price.price)
}

#[error_code]
pub enum RouletteError {
    #[msg("Invalid bet amount.")]
    InvalidAmount,
    #[msg("Direction must be 0 (up) or 1 (down).")]
    InvalidDirection,
    #[msg("Bet already resolved.")]
    BetAlreadyResolved,
    #[msg("Only the original player can resolve this bet.")]
    InvalidPlayer,
    #[msg("Pyth price account is invalid.")]
    InvalidPythPriceAccount,
    #[msg("Pyth price is stale.")]
    StalePrice,
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Vault does not have enough balance for payout.")]
    InsufficientVaultBalance,
}
