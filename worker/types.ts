import type { Context } from 'hono';
import type { Role } from '../shared/constants';
import type { SessionUser } from './auth/session';
import type { Env } from './env';

export interface TripAccess {
  tripId: string;
  role: Role;
  baseCurrency: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    requestId: string;
    user: SessionUser | null;
    sessionId: string | null;
    trip: TripAccess;
  };
}

export type AppContext = Context<AppEnv>;
