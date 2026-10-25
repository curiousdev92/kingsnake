import { create } from 'zustand';
import type { SandboxStats } from './game/Sandbox';

export const useHud = create<SandboxStats>(() => ({
  mass: 0,
  alive: 0,
  total: 0,
  status: 'playing',
  placement: 0,
}));
