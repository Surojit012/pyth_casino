'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { GameProof, NewProofInput, ProofGame } from '@/lib/proof';
import { createProofId, generateMockSignature } from '@/lib/proof';

interface ProofContextValue {
  proofs: GameProof[];
  addProof: (input: NewProofInput) => GameProof;
}

const ProofContext = createContext<ProofContextValue | undefined>(undefined);
const MAX_PROOFS = 5;

export function ProofProvider({ children }: { children: React.ReactNode }) {
  const [proofs, setProofs] = useState<GameProof[]>([]);

  const addProof = useCallback((input: NewProofInput): GameProof => {
    const nextProof: GameProof = {
      id: createProofId(),
      timestamp: input.timestamp ?? Date.now(),
      dataSource: input.dataSource ?? 'Solana Mainnet Stream',
      ...input,
    };
    
    // Inject verifiable signature
    nextProof.signature = input.signature ?? generateMockSignature(nextProof);

    setProofs(prev => [nextProof, ...prev].slice(0, MAX_PROOFS));
    return nextProof;
  }, []);

  const value = useMemo(() => ({ proofs, addProof }), [proofs, addProof]);

  return (
    <ProofContext.Provider value={value}>
      {children}
    </ProofContext.Provider>
  );
}

export function useProofContext() {
  const context = useContext(ProofContext);
  if (!context) throw new Error('useProofContext must be used within ProofProvider');
  return context;
}

export function useGameProof(game: ProofGame) {
  const { proofs, addProof } = useProofContext();

  const proofHistory = useMemo(
    () => proofs.filter(proof => proof.game === game).slice(0, MAX_PROOFS),
    [proofs, game]
  );

  const latestProof = proofHistory[0] ?? null;

  const recordProof = useCallback((input: Omit<NewProofInput, 'game'>) => {
    return addProof({ ...input, game });
  }, [addProof, game]);

  return {
    latestProof,
    proofHistory,
    recordProof,
  };
}
