import { z } from 'zod';

import type { ClientMsg, GameMode, Side } from './types.js';

export const GameModeSchema = z.union([z.literal('crash_dual'), z.literal('duel_ab')]);

export const SideSchema = z.union([z.literal('A'), z.literal('B')]);

export const AuthSchema = z.object({
  t: z.literal('auth'),
  uid: z.string().min(1).optional()
});

export const SwitchModeSchema = z.object({
  t: z.literal('switch_mode'),
  mode: GameModeSchema
});

export const BetSchema = z.object({
  t: z.literal('bet'),
  amount: z.number().finite().positive(),
  side: SideSchema.optional(),
  betId: z.string().min(1)
});

export const CashoutSchema = z.object({
  t: z.literal('cashout')
});

export const MicroSchema = z.object({
  t: z.literal('micro'),
  what: z.union([z.literal('speed'), z.literal('defense')]),
  side: SideSchema,
  value: z.number().finite()
});

export const TopupSchema = z.object({
  t: z.literal('topup'),
  amount: z.number().finite().positive()
});

export const PingSchema = z.object({
  t: z.literal('ping')
});

export const ClientMsgSchema = z.discriminatedUnion('t', [
  AuthSchema,
  SwitchModeSchema,
  BetSchema,
  CashoutSchema,
  MicroSchema,
  TopupSchema,
  PingSchema
]);

type AssertSide = z.infer<typeof SideSchema> extends Side ? true : never;
type AssertGameMode = z.infer<typeof GameModeSchema> extends GameMode ? true : never;
type AssertClientMsg = z.infer<typeof ClientMsgSchema> extends ClientMsg ? true : never;
type AssertClientMsgReverse = ClientMsg extends z.infer<typeof ClientMsgSchema> ? true : never;

const _assertSide: AssertSide = true;
const _assertGameMode: AssertGameMode = true;
const _assertClientMsg: AssertClientMsg = true;
const _assertClientMsgReverse: AssertClientMsgReverse = true;
void [_assertSide, _assertGameMode, _assertClientMsg, _assertClientMsgReverse];
