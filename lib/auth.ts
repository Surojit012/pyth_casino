import jwt, { type JwtPayload } from 'jsonwebtoken';

export interface CasinoJwtPayload extends JwtPayload {
  walletAddress: string;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export function signCasinoJwt(walletAddress: string) {
  return jwt.sign({ walletAddress }, getJwtSecret(), { expiresIn: '24h' });
}

export function verifyCasinoJwt(token: string): CasinoJwtPayload {
  const decoded = jwt.verify(token, getJwtSecret());
  if (!decoded || typeof decoded !== 'object' || typeof decoded.walletAddress !== 'string') {
    throw new Error('Invalid JWT payload');
  }
  return decoded as CasinoJwtPayload;
}

export function getBearerToken(request: Request): string {
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw new Error('Missing Authorization bearer token');
  }
  return header.slice('Bearer '.length).trim();
}

export function getWalletFromRequest(request: Request): string {
  const token = getBearerToken(request);
  const payload = verifyCasinoJwt(token);
  return payload.walletAddress;
}

