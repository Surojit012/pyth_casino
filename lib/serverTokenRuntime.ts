import fs from 'node:fs';
import path from 'node:path';

export function getScriptMintMismatch(envMintAddress: string) {
  try {
    const tokenInfoPath = path.join(process.cwd(), 'scripts', 'token-info.json');
    if (!fs.existsSync(tokenInfoPath)) return null;

    const raw = fs.readFileSync(tokenInfoPath, 'utf8');
    const parsed = JSON.parse(raw) as { mintAddress?: string };
    if (!parsed.mintAddress || parsed.mintAddress === envMintAddress) return null;

    return {
      scriptMintAddress: parsed.mintAddress,
      warning: `scripts/token-info.json points to ${parsed.mintAddress}, but the app is using canonical env mint ${envMintAddress}.`,
    };
  } catch {
    return null;
  }
}
