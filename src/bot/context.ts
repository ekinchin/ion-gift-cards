import type { Context, SessionFlavor } from 'grammy';
import type { PendingMenuAction } from './pending-menu-action.ts';

export interface SessionData {
  action?: PendingMenuAction;
  cardCode?: string;
}

export type MyContext = Context & SessionFlavor<SessionData>;
