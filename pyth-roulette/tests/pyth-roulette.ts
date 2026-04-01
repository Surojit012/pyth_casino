import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { PythRoulette } from "../target/types/pyth_roulette";

describe("pyth-roulette", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.pythRoulette as Program<PythRoulette>;

  it("Places a bet and stores it on-chain", async () => {
    const bet = anchor.web3.Keypair.generate();
    const vault = anchor.web3.Keypair.generate();
    const amount = new anchor.BN(1_000_000);
    const direction = true;

    // Ensure vault account exists before receiving transfer.
    const airdropSig = await provider.connection.requestAirdrop(
      vault.publicKey,
      1_000_000
    );
    await provider.connection.confirmTransaction(airdropSig, "confirmed");
    const vaultBalanceBefore = await provider.connection.getBalance(vault.publicKey);

    await program.methods
      .placeBet(amount, direction)
      .accounts({
        bet: bet.publicKey,
        user: provider.wallet.publicKey,
        vault: vault.publicKey,
        pythBtcPrice: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bet])
      .rpc();

    const storedBet = await program.account.bet.fetch(bet.publicKey);
    assert.equal(
      storedBet.player.toBase58(),
      provider.wallet.publicKey.toBase58()
    );
    assert.equal(storedBet.amount.toString(), amount.toString());
    assert.equal(storedBet.direction, direction);
    assert.equal(storedBet.resolved, false);

    const vaultBalanceAfter = await provider.connection.getBalance(vault.publicKey);
    assert.equal(vaultBalanceAfter - vaultBalanceBefore, amount.toNumber());
  });
});
