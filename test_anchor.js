const { Program } = require('@coral-xyz/anchor');
const idl = require('./lib/idl/pyth_roulette.json');
try {
  const p = new Program(idl, "11111111111111111111111111111111", { connection: {} });
  console.log("Program initialized successfully!");
  
  // try to build instruction
  const ix = p.instruction.placeBet(new (require('@coral-xyz/anchor').BN)(50000000), true, {
    accounts: {
      bet: "11111111111111111111111111111111",
      user: "11111111111111111111111111111111",
      vault: "11111111111111111111111111111111",
      pythBtcPrice: "11111111111111111111111111111111",
      systemProgram: "11111111111111111111111111111111"
    }
  });
  console.log("Instruction generated perfectly!", ix);
} catch (e) {
  console.error("ERROR:", e);
}
