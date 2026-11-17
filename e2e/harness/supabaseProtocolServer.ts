import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

export type TableName =
  | 'profiles'
  | 'worlds'
  | 'campaign_members'
  | 'character_sheet_templates'
  | 'characters'
  | 'map_quest_boards'
  | 'guild_quests'
  | 'guild_quest_signups'
  | 'journal_pages'
  | 'journal_page_shares'
  | 'maps'
  | 'entities'
  | 'entity_links'
  | 'map_pins'
  | 'map_paths'
  | 'vault_assets'
  | 'entity_templates'
  | 'map_fog_states'
  | 'map_fog_shares'
  | 'dice_rolls'
  | 'timeline_events';

export const ALL_TABLES: ReadonlySet<string> = new Set<TableName>([
  'profiles',
  'worlds',
  'campaign_members',
  'character_sheet_templates',
  'characters',
  'map_quest_boards',
  'guild_quests',
  'guild_quest_signups',
  'journal_pages',
  'journal_page_shares',
  'maps',
  'entities',
  'entity_links',
  'map_pins',
  'map_paths',
  'vault_assets',
  'entity_templates',
  'map_fog_states',
  'map_fog_shares',
  'dice_rolls',
  'timeline_events',
]);

export type Row = Record<string, unknown>;

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface StoredObject {
  bucket: string;
  path: string;
  contentType: string;
  data: Buffer;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProtocolServerInfo {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  port: number;
}

interface PostgresSubBinding {
  id: number;
  event: string;
  schema?: string;
  table?: string;
  filter?: string;
}

interface JoinedChannel {
  topic: string;
  vsn: '1.0.0' | '2.0.0';
  broadcastAck: boolean;
  broadcastSelf: boolean;
  userId: string | null;
  role: 'anon' | 'authenticated' | 'service_role';
  postgresChanges: PostgresSubBinding[];
}

interface ClientSocketState {
  ws: WebSocket;
  vsn: '1.0.0' | '2.0.0';
  userId: string | null;
  role: 'anon' | 'authenticated' | 'service_role';
  channels: Map<string, JoinedChannel>;
}

interface CallerContext {
  role: 'anon' | 'authenticated' | 'service_role';
  userId: string | null;
  tokenError?: { status: number; code: string; message: string };
}

class PostgrestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: string | null = null,
    public readonly hint: string | null = null,
  ) {
    super(message);
  }
}

const GM_ONLY_MUTATION_TABLES = new Set<string>([
  'worlds',
  'character_sheet_templates',
  'map_quest_boards',
  'guild_quests',
  'maps',
  'entities',
  'entity_links',
  'map_pins',
  'map_paths',
  'vault_assets',
  'entity_templates',
  'timeline_events',
]);

const GM_SECRET_FILTERED_TABLES = new Set<string>(['entities']);

const TABLES_WITH_ID = new Set<string>([
  'worlds',
  'entities',
  'maps',
  'map_pins',
  'map_paths',
  'vault_assets',
  'character_sheet_templates',
  'characters',
  'map_quest_boards',
  'guild_quests',
  'guild_quest_signups',
  'journal_pages',
  'map_fog_shares',
  'dice_rolls',
  'timeline_events',
]);

const TABLES_WITH_CREATED_AT = new Set<string>([
  'worlds',
  'maps',
  'map_pins',
  'map_paths',
  'vault_assets',
  'map_quest_boards',
  'guild_quests',
  'dice_rolls',
  'timeline_events',
]);

const TABLES_WITH_UPDATED_AT = new Set<string>([
  'profiles',
  'worlds',
  'entities',
  'entity_templates',
  'character_sheet_templates',
  'characters',
  'guild_quests',
  'journal_pages',
  'map_fog_states',
]);

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function cloneRow<T extends Row>(row: T): T {
  return JSON.parse(JSON.stringify(row)) as T;
}

export class SupabaseProtocolServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private port = 0;
  private baseUrl = '';
  private readonly jwtSecret = crypto.randomBytes(32).toString('hex');
  private readonly anonKey: string;
  private readonly serviceRoleKey: string;

  private users = new Map<string, AuthUserRecord>();
  private usersByEmail = new Map<string, AuthUserRecord>();
  private refreshTokens = new Map<string, { userId: string; sessionId: string }>();
  private revokedTokenIds = new Set<string>();
  private recoveryRequests: Array<{ email: string; timestamp: string }> = [];

  private tables = new Map<string, Row[]>();
  private storage = new Map<string, StoredObject>();
  private wsClients = new Set<ClientSocketState>();
  private nextPgSubId = 1;

  constructor() {
    const iat = Math.floor(Date.now() / 1000);
    this.anonKey = this.signJwt({
      role: 'anon',
      iss: 'supabase',
      iat,
      exp: iat + 86400 * 365,
    });
    this.serviceRoleKey = this.signJwt({
      role: 'service_role',
      iss: 'supabase',
      iat,
      exp: iat + 86400 * 365,
    });
    this.initEmptyTables();
  }

  private initEmptyTables(): void {
    this.tables.clear();
    for (const table of ALL_TABLES) {
      this.tables.set(table, []);
    }
  }

  public reset(): void {
    this.users.clear();
    this.usersByEmail.clear();
    this.refreshTokens.clear();
    this.revokedTokenIds.clear();
    this.recoveryRequests = [];
    this.storage.clear();
    this.initEmptyTables();
  }

  public getInfo(): ProtocolServerInfo {
    if (!this.server) {
      throw new Error('SupabaseProtocolServer is not started');
    }
    return {
      url: this.baseUrl,
      anonKey: this.anonKey,
      serviceRoleKey: this.serviceRoleKey,
      port: this.port,
    };
  }

  public getTableRows(table: TableName): Row[] {
    return (this.tables.get(table) ?? []).map((r) => cloneRow(r));
  }

  public getRecoveryRequests(): ReadonlyArray<{ email: string; timestamp: string }> {
    return [...this.recoveryRequests];
  }

  public async start(listenPort = 0): Promise<ProtocolServerInfo> {
    if (this.server) {
      return this.getInfo();
    }
    this.server = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });
    this.wss = new WebSocketServer({ noServer: true });
    this.server.on('upgrade', (req, socket, head) => {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (reqUrl.pathname === '/realtime/v1/websocket') {
        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          this.handleWsConnection(ws, reqUrl, req);
        });
      } else {
        socket.destroy();
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(listenPort, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('Failed to bind server address'));
          return;
        }
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve();
      });
    });

    return this.getInfo();
  }

  public async stop(): Promise<void> {
    for (const client of this.wsClients) {
      try {
        client.ws.close();
      } catch {
        // ignore close errors
      }
    }
    this.wsClients.clear();
    if (this.wss) {
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
      this.wss = null;
    }
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  private signJwt(payload: Record<string, unknown>): string {
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(payload));
    const sig = base64UrlEncode(
      crypto.createHmac('sha256', this.jwtSecret).update(`${header}.${body}`).digest(),
    );
    return `${header}.${body}.${sig}`;
  }

  private verifyJwt(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = base64UrlEncode(
      crypto.createHmac('sha256', this.jwtSecret).update(`${header}.${body}`).digest(),
    );
    if (sig !== expected) return null;
    try {
      const payload = JSON.parse(base64UrlDecode(body)) as Record<string, unknown>;
      const exp = typeof payload.exp === 'number' ? payload.exp : 0;
      if (exp && exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      if (typeof payload.jti === 'string' && this.revokedTokenIds.has(payload.jti)) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private issueSession(user: AuthUserRecord) {
    const iat = Math.floor(Date.now() / 1000);
    const expiresIn = 3600;
    const expiresAt = iat + expiresIn;
    const jti = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const accessToken = this.signJwt({
      aud: 'authenticated',
      role: 'authenticated',
      sub: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
      app_metadata: user.app_metadata,
      session_id: sessionId,
      jti,
      iat,
      exp: expiresAt,
    });
    const refreshToken = crypto.randomBytes(24).toString('hex');
    this.refreshTokens.set(refreshToken, { userId: user.id, sessionId });
    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: expiresIn,
      expires_at: expiresAt,
      refresh_token: refreshToken,
      user: this.serializeAuthUser(user),
    };
  }

  private serializeAuthUser(user: AuthUserRecord): Record<string, unknown> {
    return {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: user.created_at,
      confirmed_at: user.created_at,
      last_sign_in_at: user.updated_at,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
      identities: [],
      created_at: user.created_at,
      updated_at: user.updated_at,
      is_anonymous: false,
    };
  }

  private resolveCaller(req: http.IncomingMessage): CallerContext {
    const authHeader = req.headers.authorization;
    const apikeyHeader = typeof req.headers.apikey === 'string' ? req.headers.apikey : undefined;
    const rawBearer = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : authHeader?.startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : undefined;
    const token = rawBearer || apikeyHeader;
    if (!token) {
      return { role: 'anon', userId: null };
    }
    const payload = this.verifyJwt(token);
    if (!payload) {
      if (rawBearer && rawBearer !== this.anonKey) {
        return {
          role: 'anon',
          userId: null,
          tokenError: { status: 401, code: 'PGRST301', message: 'JWT expired or invalid' },
        };
      }
      return { role: 'anon', userId: null };
    }
    if (payload.role === 'service_role') {
      return { role: 'service_role', userId: null };
    }
    if (payload.role === 'authenticated' && typeof payload.sub === 'string') {
      if (!this.users.has(payload.sub)) {
        return {
          role: 'anon',
          userId: null,
          tokenError: { status: 401, code: 'PGRST301', message: 'User not found for JWT' },
        };
      }
      return { role: 'authenticated', userId: payload.sub };
    }
    return { role: 'anon', userId: null };
  }

  private applyCorsHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'authorization, apikey, content-type, prefer, x-client-info, x-upsert, range, accept, accept-profile, content-profile, x-supabase-api-version',
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Preference-Applied');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }

  private sendJson(res: http.ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
    this.applyCorsHeaders(res);
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) {
        res.setHeader(k, v);
      }
    }
    if (status === 204) {
      res.writeHead(204);
      res.end();
      return;
    }
    const json = JSON.stringify(body);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(status);
    res.end(json);
  }

  private async readRawBody(req: http.IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    const raw = await this.readRawBody(req);
    if (raw.length === 0) return {};
    return JSON.parse(raw.toString('utf8'));
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.applyCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url ?? '/', this.baseUrl);
    const pathname = reqUrl.pathname;

    try {
      if (pathname.startsWith('/auth/v1/')) {
        await this.handleAuth(req, res, reqUrl);
        return;
      }
      if (pathname.startsWith('/rest/v1/rpc/')) {
        await this.handleRpc(req, res, pathname.slice('/rest/v1/rpc/'.length));
        return;
      }
      if (pathname.startsWith('/rest/v1/')) {
        await this.handleRest(req, res, reqUrl);
        return;
      }
      if (pathname.startsWith('/storage/v1/')) {
        await this.handleStorage(req, res, reqUrl);
        return;
      }
      if (pathname === '/health') {
        this.sendJson(res, 200, { ok: true });
        return;
      }
      this.sendJson(res, 404, { error: 'not_found', message: `Unknown path ${pathname}` });
    } catch (err) {
      if (err instanceof PostgrestError) {
        this.sendJson(res, err.status, {
          code: err.code,
          details: err.details,
          hint: err.hint,
          message: err.message,
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.sendJson(res, 500, { code: 'XX000', message, details: null, hint: null });
    }
  }

  // =========================================================================
  // Auth (/auth/v1/*)
  // =========================================================================
  private async handleAuth(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const route = url.pathname.slice('/auth/v1'.length);
    const method = (req.method ?? 'GET').toUpperCase();

    if (route === '/signup' && method === 'POST') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const dataObj =
        (typeof body.data === 'object' && body.data !== null ? (body.data as Record<string, unknown>) : undefined) ??
        (typeof (body.options as Record<string, unknown> | undefined)?.data === 'object'
          ? ((body.options as Record<string, unknown>).data as Record<string, unknown>)
          : undefined) ??
        {};

      if (!email || !email.includes('@')) {
        this.sendJson(res, 422, {
          error: 'validation_failed',
          error_code: 'validation_failed',
          msg: 'Unable to validate email address: invalid format',
        });
        return;
      }
      if (password.length < 6) {
        this.sendJson(res, 422, {
          error: 'weak_password',
          error_code: 'weak_password',
          msg: 'Password should be at least 6 characters.',
        });
        return;
      }
      if (this.usersByEmail.has(email)) {
        this.sendJson(res, 422, {
          error: 'user_already_exists',
          error_code: 'user_already_exists',
          msg: 'User already registered',
        });
        return;
      }

      const now = nowIso();
      const userId = crypto.randomUUID();
      const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
      const displayName =
        typeof dataObj.display_name === 'string' && dataObj.display_name.trim()
          ? dataObj.display_name.trim()
          : email.split('@')[0];
      const user: AuthUserRecord = {
        id: userId,
        email,
        passwordHash,
        user_metadata: { ...dataObj, display_name: displayName },
        app_metadata: { provider: 'email', providers: ['email'] },
        created_at: now,
        updated_at: now,
      };
      this.users.set(userId, user);
      this.usersByEmail.set(email, user);

      // Trigger: on_auth_user_created -> insert public.profiles (schema.sql: id, display_name, avatar_url, bio, updated_at)
      const profileRow: Row = {
        id: userId,
        display_name: displayName,
        avatar_url: null,
        bio: '',
        updated_at: now,
      };
      this.tables.get('profiles')!.push(profileRow);
      this.emitPostgresChange('INSERT', 'profiles', profileRow, null);

      const session = this.issueSession(user);
      this.sendJson(res, 200, session);
      return;
    }

    if (route === '/token' && method === 'POST') {
      const grantType = url.searchParams.get('grant_type') ?? 'password';
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;

      if (grantType === 'password') {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const user = this.usersByEmail.get(email);
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        if (!user || user.passwordHash !== passwordHash) {
          this.sendJson(res, 400, {
            error: 'invalid_grant',
            error_code: 'invalid_credentials',
            error_description: 'Invalid login credentials',
            msg: 'Invalid login credentials',
          });
          return;
        }
        user.updated_at = nowIso();
        const session = this.issueSession(user);
        this.sendJson(res, 200, session);
        return;
      }

      if (grantType === 'refresh_token') {
        const rt = typeof body.refresh_token === 'string' ? body.refresh_token : '';
        const entry = this.refreshTokens.get(rt);
        if (!entry) {
          this.sendJson(res, 400, {
            error: 'invalid_grant',
            error_code: 'refresh_token_not_found',
            error_description: 'Invalid Refresh Token: Refresh Token Not Found',
            msg: 'Invalid Refresh Token',
          });
          return;
        }
        const user = this.users.get(entry.userId);
        if (!user) {
          this.sendJson(res, 400, { error: 'invalid_grant', msg: 'User not found' });
          return;
        }
        this.refreshTokens.delete(rt);
        const session = this.issueSession(user);
        this.sendJson(res, 200, session);
        return;
      }

      this.sendJson(res, 400, { error: 'unsupported_grant_type', msg: `Unsupported grant_type: ${grantType}` });
      return;
    }

    if (route === '/user' && method === 'GET') {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const payload = token ? this.verifyJwt(token) : null;
      if (!payload || payload.role !== 'authenticated' || typeof payload.sub !== 'string') {
        this.sendJson(res, 401, {
          error: 'unauthorized',
          error_code: 'bad_jwt',
          msg: 'Invalid or expired JWT',
        });
        return;
      }
      const user = this.users.get(payload.sub);
      if (!user) {
        this.sendJson(res, 401, { error: 'unauthorized', msg: 'User does not exist' });
        return;
      }
      this.sendJson(res, 200, this.serializeAuthUser(user));
      return;
    }

    if (route === '/user' && method === 'PUT') {
      const caller = this.resolveCaller(req);
      if (caller.role !== 'authenticated' || !caller.userId) {
        this.sendJson(res, 401, { error: 'unauthorized', msg: 'Not authenticated' });
        return;
      }
      const user = this.users.get(caller.userId)!;
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      if (typeof body.data === 'object' && body.data !== null) {
        user.user_metadata = { ...user.user_metadata, ...(body.data as Record<string, unknown>) };
      }
      if (typeof body.password === 'string' && body.password.length >= 6) {
        user.passwordHash = crypto.createHash('sha256').update(body.password).digest('hex');
      }
      user.updated_at = nowIso();
      this.sendJson(res, 200, this.serializeAuthUser(user));
      return;
    }

    if (route === '/logout' && method === 'POST') {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (token) {
        const payload = this.verifyJwt(token);
        if (payload && typeof payload.jti === 'string') {
          this.revokedTokenIds.add(payload.jti);
        }
        if (payload && typeof payload.session_id === 'string') {
          for (const [rt, entry] of this.refreshTokens.entries()) {
            if (entry.sessionId === payload.session_id) {
              this.refreshTokens.delete(rt);
            }
          }
        }
      }
      this.sendJson(res, 204, null);
      return;
    }

    if (route === '/recover' && method === 'POST') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email) {
        this.recoveryRequests.push({ email, timestamp: nowIso() });
      }
      this.sendJson(res, 200, {});
      return;
    }

    this.sendJson(res, 404, { error: 'not_found', msg: `Unsupported auth endpoint: ${method} ${route}` });
  }

  // =========================================================================
  // Membership & RLS Helpers
  // =========================================================================
  private getMemberRecord(campaignId: unknown, userId: string | null): Row | undefined {
    if (typeof campaignId !== 'string' || !userId) return undefined;
    const members = this.tables.get('campaign_members') ?? [];
    return members.find((m) => m.campaign_id === campaignId && m.user_id === userId);
  }

  private isCampaignMember(campaignId: unknown, caller: CallerContext): boolean {
    if (caller.role === 'service_role') return true;
    if (caller.role !== 'authenticated' || !caller.userId) return false;
    if (typeof campaignId !== 'string') return false;
    if (this.getMemberRecord(campaignId, caller.userId)) return true;
    const world = (this.tables.get('worlds') ?? []).find((w) => w.id === campaignId);
    return world?.owner_id === caller.userId;
  }

  private isCampaignGm(campaignId: unknown, caller: CallerContext): boolean {
    if (caller.role === 'service_role') return true;
    if (caller.role !== 'authenticated' || !caller.userId) return false;
    if (typeof campaignId !== 'string') return false;
    const member = this.getMemberRecord(campaignId, caller.userId);
    if (member && (member.role === 'gm' || member.role === 'co_gm')) {
      return true;
    }
    const world = (this.tables.get('worlds') ?? []).find((w) => w.id === campaignId);
    return world?.owner_id === caller.userId;
  }

  private isCampaignPrimaryGm(campaignId: unknown, caller: CallerContext): boolean {
    if (caller.role === 'service_role') return true;
    if (caller.role !== 'authenticated' || !caller.userId) return false;
    if (typeof campaignId !== 'string') return false;
    const world = (this.tables.get('worlds') ?? []).find((w) => w.id === campaignId);
    if (world?.owner_id === caller.userId) return true;
    const member = this.getMemberRecord(campaignId, caller.userId);
    return member?.role === 'gm';
  }

  private isUserCampaignMember(campaignId: unknown, userId: unknown): boolean {
    if (typeof campaignId !== 'string' || typeof userId !== 'string' || !userId) return false;
    if (this.getMemberRecord(campaignId, userId)) return true;
    const world = (this.tables.get('worlds') ?? []).find((w) => w.id === campaignId);
    return world?.owner_id === userId;
  }

  private getCampaignIdForRow(table: string, row: Row): string | undefined {
    switch (table) {
      case 'worlds':
        return typeof row.id === 'string' ? row.id : undefined;
      case 'entities':
      case 'entity_links':
      case 'maps':
      case 'vault_assets':
      case 'entity_templates':
        return typeof row.world_id === 'string' ? row.world_id : undefined;
      case 'map_pins':
      case 'map_paths': {
        if (typeof row.map_id === 'string') {
          const map = (this.tables.get('maps') ?? []).find((m) => m.id === row.map_id);
          return typeof map?.world_id === 'string' ? map.world_id : undefined;
        }
        return undefined;
      }
      case 'journal_page_shares': {
        if (typeof row.page_id === 'string') {
          const page = (this.tables.get('journal_pages') ?? []).find((p) => p.id === row.page_id);
          return typeof page?.campaign_id === 'string' ? page.campaign_id : undefined;
        }
        return undefined;
      }
      case 'guild_quest_signups': {
        if (typeof row.campaign_id === 'string') return row.campaign_id;
        if (typeof row.quest_id === 'string') {
          const quest = (this.tables.get('guild_quests') ?? []).find((q) => q.id === row.quest_id);
          return typeof quest?.campaign_id === 'string' ? quest.campaign_id : undefined;
        }
        return undefined;
      }
      default:
        return typeof row.campaign_id === 'string' ? row.campaign_id : undefined;
    }
  }

  private canSelectRow(table: string, row: Row, caller: CallerContext): boolean {
    if (caller.role === 'service_role') return true;
    if (caller.role !== 'authenticated' || !caller.userId) return false;

    const uid = caller.userId;
    const cid = this.getCampaignIdForRow(table, row);

    switch (table) {
      case 'profiles':
        return true;

      case 'worlds':
        return row.owner_id === uid || this.isCampaignMember(row.id, caller);

      case 'campaign_members':
      case 'character_sheet_templates':
      case 'characters':
      case 'map_quest_boards':
      case 'guild_quests':
      case 'guild_quest_signups':
      case 'maps':
      case 'entities':
      case 'entity_links':
      case 'vault_assets':
      case 'entity_templates':
      case 'map_fog_shares':
        return this.isCampaignMember(cid, caller);

      case 'journal_pages': {
        if (!this.isCampaignMember(cid, caller)) return false;
        if (row.owner_id === uid) return true;
        if (row.share_scope === 'campaign') return true;
        if (row.share_scope === 'selected') {
          const shares = this.tables.get('journal_page_shares') ?? [];
          return shares.some((s) => s.page_id === row.id && s.shared_with_user_id === uid);
        }
        return false;
      }

      case 'journal_page_shares': {
        if (!this.isCampaignMember(cid, caller)) return false;
        if (row.shared_with_user_id === uid) return true;
        const page = (this.tables.get('journal_pages') ?? []).find((p) => p.id === row.page_id);
        return page?.owner_id === uid;
      }

      case 'map_fog_states': {
        if (this.isCampaignGm(cid, caller)) return true;
        if (row.user_id === uid) return true;
        if (!this.isCampaignMember(cid, caller)) return false;
        const shares = this.tables.get('map_fog_shares') ?? [];
        return shares.some(
          (s) =>
            s.campaign_id === cid &&
            s.map_id === row.map_id &&
            s.owner_user_id === row.user_id &&
            (s.share_all === true || s.shared_with_user_id === uid),
        );
      }

      case 'dice_rolls': {
        if (this.isCampaignGm(cid, caller)) return true;
        if (!this.isCampaignMember(cid, caller)) return false;
        return row.is_gm_blind !== true || row.user_id === uid;
      }

      case 'map_pins':
      case 'map_paths':
      case 'timeline_events': {
        if (!this.isCampaignMember(cid, caller)) return false;
        if (row.is_gm_only === true) {
          return this.isCampaignGm(cid, caller);
        }
        return true;
      }

      default:
        return false;
    }
  }

  private sanitizeRowForCaller(table: string, row: Row, caller: CallerContext): Row {
    const copy = cloneRow(row);
    if (GM_SECRET_FILTERED_TABLES.has(table)) {
      const cid = this.getCampaignIdForRow(table, copy);
      if (!this.isCampaignGm(cid, caller)) {
        copy.gm_secrets = null;
      }
    }
    return copy;
  }

  private assertCanInsert(table: string, row: Row, caller: CallerContext): void {
    if (caller.role === 'service_role') return;
    if (caller.role !== 'authenticated' || !caller.userId) {
      throw new PostgrestError(401, '42501', 'Authentication required');
    }
    const uid = caller.userId;
    const cid = this.getCampaignIdForRow(table, row);

    if (table === 'profiles') {
      if (row.id !== uid) {
        throw new PostgrestError(403, '42501', 'new row violates row-level security policy for table "profiles"');
      }
      return;
    }

    if (table === 'worlds') {
      if (row.owner_id !== uid) {
        throw new PostgrestError(403, '42501', 'new row violates row-level security policy for table "worlds"');
      }
      return;
    }

    if (table === 'campaign_members') {
      if (!this.isCampaignGm(cid, caller)) {
        throw new PostgrestError(403, '42501', 'new row violates row-level security policy for table "campaign_members"');
      }
      const role = typeof row.role === 'string' ? row.role : 'player';
      if (role === 'gm' && !this.isCampaignPrimaryGm(cid, caller)) {
        throw new PostgrestError(
          403,
          '42501',
          'new row violates row-level security policy for table "campaign_members"',
        );
      }
      return;
    }

    if (GM_ONLY_MUTATION_TABLES.has(table)) {
      if (!this.isCampaignGm(cid, caller)) {
        throw new PostgrestError(403, '42501', `new row violates row-level security policy for table "${table}"`);
      }
      return;
    }

    if (!this.isCampaignMember(cid, caller)) {
      throw new PostgrestError(403, '42501', `new row violates row-level security policy for table "${table}"`);
    }

    switch (table) {
      case 'characters':
        if (row.user_id !== uid && !this.isCampaignGm(cid, caller)) {
          throw new PostgrestError(403, '42501', 'new row violates row-level security policy for table "characters"');
        }
        return;

      case 'journal_pages': {
        if (row.owner_id !== uid) {
          throw new PostgrestError(403, '42501', 'new row violates row-level security policy for table "journal_pages"');
        }
        return;
      }

      case 'journal_page_shares': {
        const page = (this.tables.get('journal_pages') ?? []).find((p) => p.id === row.page_id);
        if (!page || page.owner_id !== uid || !this.isUserCampaignMember(page.campaign_id, row.shared_with_user_id)) {
          throw new PostgrestError(
            403,
            '42501',
            'new row violates row-level security policy for table "journal_page_shares"',
          );
        }
        return;
      }

      case 'map_fog_states': {
        const mapMatch = (this.tables.get('maps') ?? []).some((m) => m.id === row.map_id && m.world_id === cid);
        const memberMatch = this.isUserCampaignMember(cid, row.user_id);
        if (!this.isCampaignGm(cid, caller) || !mapMatch || !memberMatch) {
          throw new PostgrestError(
            403,
            '42501',
            'new row violates row-level security policy for table "map_fog_states"',
          );
        }
        return;
      }

      case 'map_fog_shares': {
        const isOwnerOrGm =
          (this.isCampaignMember(cid, caller) && row.owner_user_id === uid) || this.isCampaignGm(cid, caller);
        const mapMatch = (this.tables.get('maps') ?? []).some((m) => m.id === row.map_id && m.world_id === cid);
        const ownerIsMember = this.isUserCampaignMember(cid, row.owner_user_id);
        const targetIsMember =
          row.shared_with_user_id === null ||
          row.shared_with_user_id === undefined ||
          this.isUserCampaignMember(cid, row.shared_with_user_id);
        if (!isOwnerOrGm || !mapMatch || !ownerIsMember || !targetIsMember) {
          throw new PostgrestError(
            403,
            '42501',
            'new row violates row-level security policy for table "map_fog_shares"',
          );
        }
        return;
      }

      case 'dice_rolls':
        if (row.user_id !== uid || (row.is_gm_blind === true && !this.isCampaignGm(cid, caller))) {
          throw new PostgrestError(403, '42501', 'new row violates row-level security policy for table "dice_rolls"');
        }
        return;

      case 'guild_quest_signups':
        if (!this.isCampaignGm(cid, caller)) {
          throw new PostgrestError(
            403,
            '42501',
            'new row violates row-level security policy for table "guild_quest_signups"',
          );
        }
        return;

      default:
        return;
    }
  }

  private assertCanUpdateOrDelete(
    op: 'UPDATE' | 'DELETE',
    table: string,
    existing: Row,
    patch: Row | null,
    caller: CallerContext,
  ): void {
    if (caller.role === 'service_role') return;
    if (caller.role !== 'authenticated' || !caller.userId) {
      throw new PostgrestError(401, '42501', 'Authentication required');
    }
    const uid = caller.userId;
    const cid = this.getCampaignIdForRow(table, existing);
    const next = patch ? { ...existing, ...patch } : existing;

    if (table === 'profiles') {
      if (op === 'DELETE' || existing.id !== uid || next.id !== uid) {
        throw new PostgrestError(403, '42501', 'permission denied for table profiles');
      }
      return;
    }

    if (table === 'worlds') {
      if (op === 'DELETE') {
        if (existing.owner_id !== uid) {
          throw new PostgrestError(403, '42501', 'Only the campaign creator GM can delete the campaign');
        }
        return;
      }
      if (!this.isCampaignGm(existing.id, caller)) {
        throw new PostgrestError(403, '42501', 'new row violates row-level security policy for table "worlds"');
      }
      // Trigger: guard_world_owner_change (schema.sql:213-227)
      if (patch && patch.owner_id !== undefined && patch.owner_id !== existing.owner_id && existing.owner_id !== uid) {
        throw new PostgrestError(403, '42501', 'Only the campaign owner can transfer ownership.');
      }
      return;
    }

    if (table === 'campaign_members') {
      const world = (this.tables.get('worlds') ?? []).find((w) => w.id === existing.campaign_id);
      const isPrimaryOwnerTarget = world?.owner_id === existing.user_id;
      const callerIsWorldOwner = world?.owner_id === uid;

      if (op === 'DELETE') {
        if (isPrimaryOwnerTarget && !callerIsWorldOwner) {
          throw new PostgrestError(403, '42501', 'Cannot remove primary campaign creator GM');
        }
        if (existing.user_id === uid) {
          return; // member leaving campaign
        }
        if (!this.isCampaignGm(existing.campaign_id, caller)) {
          throw new PostgrestError(403, '42501', 'Only GMs can remove members');
        }
        if (existing.role === 'gm' && !this.isCampaignPrimaryGm(existing.campaign_id, caller)) {
          throw new PostgrestError(403, '42501', 'Only primary GM can remove a GM');
        }
        return;
      }

      // UPDATE on campaign_members
      if (!this.isCampaignGm(existing.campaign_id, caller)) {
        throw new PostgrestError(403, '42501', 'Only GMs can update campaign member roles');
      }
      if (isPrimaryOwnerTarget && !callerIsWorldOwner) {
        throw new PostgrestError(403, '42501', 'Co-GM cannot modify primary campaign owner');
      }
      if (isPrimaryOwnerTarget && patch && patch.role !== undefined && patch.role !== 'gm') {
        throw new PostgrestError(403, '42501', 'Cannot demote primary campaign creator GM');
      }
      const nextRole = typeof next.role === 'string' ? next.role : existing.role;
      if (nextRole === 'gm' && !this.isCampaignPrimaryGm(existing.campaign_id, caller)) {
        throw new PostgrestError(403, '42501', 'Co-GM cannot promote to primary GM');
      }
      return;
    }

    if (GM_ONLY_MUTATION_TABLES.has(table)) {
      if (!this.isCampaignGm(cid, caller)) {
        throw new PostgrestError(403, '42501', `permission denied for table ${table}`);
      }
      if (op === 'UPDATE') {
        const nextCid = this.getCampaignIdForRow(table, next);
        if (!this.isCampaignGm(nextCid, caller)) {
          throw new PostgrestError(403, '42501', `new row violates row-level security policy for table "${table}"`);
        }
      }
      return;
    }

    switch (table) {
      case 'characters':
        if (this.isCampaignGm(cid, caller)) {
          if (op === 'UPDATE' && !this.isCampaignGm(this.getCampaignIdForRow(table, next), caller)) {
            throw new PostgrestError(403, '42501', 'new row violates row-level security policy for table "characters"');
          }
          return;
        }
        if (
          this.isCampaignMember(cid, caller) &&
          existing.user_id === uid &&
          (op === 'DELETE' || (next.user_id === uid && next.campaign_id === existing.campaign_id))
        ) {
          return;
        }
        throw new PostgrestError(403, '42501', 'permission denied for table characters');

      case 'journal_pages': {
        if (op === 'DELETE') {
          if (existing.owner_id === uid) return;
          throw new PostgrestError(403, '42501', 'permission denied for table journal_pages');
        }
        // UPDATE
        if (existing.owner_id === uid) {
          if (!this.isCampaignMember(next.campaign_id, caller) || next.owner_id !== uid) {
            throw new PostgrestError(403, '42501', 'new row violates row-level security policy for table "journal_pages"');
          }
          return;
        }
        // Non-owner editor check
        const shares = this.tables.get('journal_page_shares') ?? [];
        const hasEditShare =
          this.isCampaignMember(cid, caller) &&
          existing.share_scope === 'selected' &&
          shares.some((s) => s.page_id === existing.id && s.shared_with_user_id === uid && s.can_edit === true);
        if (!hasEditShare) {
          throw new PostgrestError(403, '42501', 'permission denied for table journal_pages');
        }
        // Trigger: guard_journal_page_editor_update (schema.sql:838-857)
        if (
          patch &&
          ((patch.owner_id !== undefined && patch.owner_id !== existing.owner_id) ||
            (patch.campaign_id !== undefined && patch.campaign_id !== existing.campaign_id) ||
            (patch.share_scope !== undefined && patch.share_scope !== existing.share_scope))
        ) {
          throw new PostgrestError(
            403,
            '42501',
            'Only the journal page owner can change ownership, campaign, or share scope.',
          );
        }
        return;
      }

      case 'journal_page_shares': {
        const page = (this.tables.get('journal_pages') ?? []).find((p) => p.id === existing.page_id);
        if (!page || page.owner_id !== uid) {
          throw new PostgrestError(403, '42501', 'permission denied for table journal_page_shares');
        }
        if (op === 'UPDATE') {
          const nextPage = (this.tables.get('journal_pages') ?? []).find((p) => p.id === next.page_id);
          if (
            !nextPage ||
            nextPage.owner_id !== uid ||
            !this.isUserCampaignMember(nextPage.campaign_id, next.shared_with_user_id)
          ) {
            throw new PostgrestError(
              403,
              '42501',
              'new row violates row-level security policy for table "journal_page_shares"',
            );
          }
        }
        return;
      }

      case 'map_fog_states': {
        if (!this.isCampaignGm(cid, caller)) {
          throw new PostgrestError(403, '42501', 'permission denied for table map_fog_states');
        }
        if (op === 'UPDATE') {
          const nextCid = typeof next.campaign_id === 'string' ? next.campaign_id : cid;
          const mapMatch = (this.tables.get('maps') ?? []).some((m) => m.id === next.map_id && m.world_id === nextCid);
          const memberMatch = this.isUserCampaignMember(nextCid, next.user_id);
          if (!this.isCampaignGm(nextCid, caller) || !mapMatch || !memberMatch) {
            throw new PostgrestError(
              403,
              '42501',
              'new row violates row-level security policy for table "map_fog_states"',
            );
          }
        }
        return;
      }

      case 'map_fog_shares': {
        const canAccess =
          (this.isCampaignMember(cid, caller) && existing.owner_user_id === uid) || this.isCampaignGm(cid, caller);
        if (!canAccess) {
          throw new PostgrestError(403, '42501', 'permission denied for table map_fog_shares');
        }
        if (op === 'UPDATE') {
          const nextCid = typeof next.campaign_id === 'string' ? next.campaign_id : cid;
          const nextAllowed =
            (this.isCampaignMember(nextCid, caller) && next.owner_user_id === uid) || this.isCampaignGm(nextCid, caller);
          const mapMatch = (this.tables.get('maps') ?? []).some((m) => m.id === next.map_id && m.world_id === nextCid);
          const ownerIsMember = this.isUserCampaignMember(nextCid, next.owner_user_id);
          const targetIsMember =
            next.shared_with_user_id === null ||
            next.shared_with_user_id === undefined ||
            this.isUserCampaignMember(nextCid, next.shared_with_user_id);
          if (!nextAllowed || !mapMatch || !ownerIsMember || !targetIsMember) {
            throw new PostgrestError(
              403,
              '42501',
              'new row violates row-level security policy for table "map_fog_shares"',
            );
          }
        }
        return;
      }

      case 'dice_rolls':
        if (op === 'DELETE' && (this.isCampaignGm(cid, caller) || existing.user_id === uid)) return;
        throw new PostgrestError(403, '42501', 'permission denied for table dice_rolls');

      case 'guild_quest_signups': {
        if (this.isCampaignGm(cid, caller)) return;
        if (op === 'DELETE' && existing.user_id === uid) {
          const quest = (this.tables.get('guild_quests') ?? []).find((q) => q.id === existing.quest_id);
          if (quest && (quest.status === 'open' || quest.status === 'full')) {
            return;
          }
        }
        throw new PostgrestError(403, '42501', 'permission denied for table guild_quest_signups');
      }

      default:
        if (!this.isCampaignGm(cid, caller)) {
          throw new PostgrestError(403, '42501', `permission denied for table ${table}`);
        }
    }
  }

  private checkWorldTriggers(existing: Row, nextRow: Row): void {
    if (nextRow.mode === 'west_marches' && existing.mode !== 'west_marches') {
      const counts = new Map<string, number>();
      for (const c of this.tables.get('characters') ?? []) {
        if (c.campaign_id === nextRow.id && c.is_active === true && typeof c.user_id === 'string') {
          const nextCount = (counts.get(c.user_id) ?? 0) + 1;
          if (nextCount > 1) {
            throw new PostgrestError(
              409,
              '23505',
              'Cannot switch to West Marches while a player has more than one active character.',
            );
          }
          counts.set(c.user_id, nextCount);
        }
      }
    }
  }

  private checkCharacterTriggers(candidate: Row): void {
    if (candidate.is_active !== true) return;
    const world = (this.tables.get('worlds') ?? []).find((w) => w.id === candidate.campaign_id);
    if (!world || world.mode !== 'west_marches') return;
    const chars = this.tables.get('characters') ?? [];
    const conflict = chars.find(
      (c) =>
        c.id !== candidate.id &&
        c.campaign_id === candidate.campaign_id &&
        c.user_id === candidate.user_id &&
        c.is_active === true,
    );
    if (conflict) {
      throw new PostgrestError(
        409,
        '23505',
        'West Marches campaigns allow at most 1 active character per player.',
        `Existing active character: ${String(conflict.id)}`,
        'Deactivate the existing active character before activating another.',
      );
    }
  }

  private getDefaultConflictCols(table: string): string[] {
    switch (table) {
      case 'campaign_members':
        return ['campaign_id', 'user_id'];
      case 'entity_links':
        return ['source_id', 'target_id'];
      case 'entity_templates':
        return ['world_id', 'type'];
      case 'journal_page_shares':
        return ['page_id', 'shared_with_user_id'];
      case 'map_fog_states':
        return ['map_id', 'user_id'];
      default:
        return ['id'];
    }
  }

  private validateRowConstraints(table: string, row: Row, existing: Row | null): void {
    const requireStr = (col: string) => {
      if (typeof row[col] !== 'string' || row[col] === '') {
        throw new PostgrestError(400, '23502', `null value in column "${col}" of relation "${table}" violates not-null constraint`);
      }
    };
    const requireFiniteNum = (col: string) => {
      if (typeof row[col] !== 'number' || !Number.isFinite(row[col])) {
        throw new PostgrestError(400, '23502', `null or invalid numeric value in column "${col}" of relation "${table}"`);
      }
    };

    switch (table) {
      case 'worlds': {
        requireStr('name');
        if (row.mode !== 'normal' && row.mode !== 'west_marches') {
          throw new PostgrestError(400, '23514', 'new row for relation "worlds" violates check constraint "worlds_mode_check"');
        }
        if (typeof row.invite_code === 'string') {
          const dup = (this.tables.get('worlds') ?? []).find(
            (w) => w !== existing && w.id !== row.id && w.invite_code === row.invite_code,
          );
          if (dup) {
            throw new PostgrestError(409, '23505', 'duplicate key value violates unique constraint "worlds_invite_code_key"');
          }
        }
        break;
      }
      case 'entities': {
        requireStr('world_id');
        requireStr('slug');
        requireStr('title');
        const dup = (this.tables.get('entities') ?? []).find(
          (e) => e !== existing && e.id !== row.id && e.world_id === row.world_id && e.slug === row.slug,
        );
        if (dup) {
          throw new PostgrestError(409, '23505', 'duplicate key value violates unique constraint "entities_world_id_slug_key"');
        }
        break;
      }
      case 'entity_links': {
        requireStr('source_id');
        requireStr('target_id');
        requireStr('world_id');
        break;
      }
      case 'maps': {
        requireStr('world_id');
        requireStr('name');
        if (row.kind !== '3d' && row.kind !== '2d') {
          throw new PostgrestError(400, '23514', 'Invalid map kind: must be "3d" or "2d"');
        }
        break;
      }
      case 'map_pins': {
        requireStr('map_id');
        requireStr('label');
        requireFiniteNum('x');
        requireFiniteNum('y');
        requireFiniteNum('z');
        if (!(this.tables.get('maps') ?? []).some((m) => m.id === row.map_id)) {
          throw new PostgrestError(409, '23503', 'insert or update on table "map_pins" violates foreign key constraint');
        }
        break;
      }
      case 'map_paths': {
        requireStr('map_id');
        requireStr('name');
        if (!(this.tables.get('maps') ?? []).some((m) => m.id === row.map_id)) {
          throw new PostgrestError(409, '23503', 'insert or update on table "map_paths" violates foreign key constraint');
        }
        break;
      }
      case 'vault_assets': {
        requireStr('world_id');
        requireStr('slug');
        requireStr('name');
        requireStr('url');
        const dup = (this.tables.get('vault_assets') ?? []).find(
          (a) => a !== existing && a.id !== row.id && a.world_id === row.world_id && a.slug === row.slug,
        );
        if (dup) {
          throw new PostgrestError(409, '23505', 'duplicate key value violates unique constraint "vault_assets_world_id_slug_key"');
        }
        break;
      }
      case 'entity_templates': {
        requireStr('world_id');
        requireStr('type');
        requireStr('label');
        break;
      }
      case 'character_sheet_templates': {
        requireStr('campaign_id');
        requireStr('name');
        break;
      }
      case 'characters': {
        requireStr('campaign_id');
        requireStr('user_id');
        requireStr('name');
        break;
      }
      case 'map_quest_boards': {
        requireStr('map_id');
        requireStr('campaign_id');
        requireStr('title');
        if (!(this.tables.get('maps') ?? []).some((m) => m.id === row.map_id)) {
          throw new PostgrestError(409, '23503', 'insert or update on table "map_quest_boards" violates foreign key constraint');
        }
        break;
      }
      case 'guild_quests': {
        requireStr('board_id');
        requireStr('campaign_id');
        requireStr('title');
        const maxPlayers = Number(row.max_players);
        if (!Number.isFinite(maxPlayers) || maxPlayers < 1) {
          throw new PostgrestError(400, '23514', 'guild_quests max_players must be >= 1');
        }
        if (!['open', 'full', 'in_progress', 'completed', 'archived'].includes(String(row.status))) {
          throw new PostgrestError(400, '23514', 'Invalid guild_quests status');
        }
        break;
      }
      case 'guild_quest_signups': {
        requireStr('quest_id');
        requireStr('campaign_id');
        requireStr('user_id');
        requireStr('character_id');
        const dup = (this.tables.get('guild_quest_signups') ?? []).find(
          (s) => s !== existing && s.id !== row.id && s.quest_id === row.quest_id && s.user_id === row.user_id,
        );
        if (dup) {
          throw new PostgrestError(409, '23505', 'duplicate key value violates unique constraint "guild_quest_signups_quest_id_user_id_key"');
        }
        break;
      }
      case 'journal_pages': {
        requireStr('campaign_id');
        requireStr('owner_id');
        requireStr('title');
        if (!['private', 'selected', 'campaign'].includes(String(row.share_scope))) {
          throw new PostgrestError(400, '23514', 'Invalid share_scope on journal_pages');
        }
        break;
      }
      case 'journal_page_shares': {
        requireStr('page_id');
        requireStr('shared_with_user_id');
        break;
      }
      case 'map_fog_states': {
        requireStr('map_id');
        requireStr('user_id');
        requireStr('campaign_id');
        break;
      }
      case 'map_fog_shares': {
        requireStr('map_id');
        requireStr('campaign_id');
        requireStr('owner_user_id');
        if (row.share_all !== true && (typeof row.shared_with_user_id !== 'string' || !row.shared_with_user_id)) {
          throw new PostgrestError(400, '23514', 'map_fog_shares requires share_all = true or shared_with_user_id');
        }
        break;
      }
      case 'dice_rolls': {
        requireStr('campaign_id');
        requireStr('user_id');
        requireStr('expression');
        requireFiniteNum('total');
        break;
      }
      case 'timeline_events': {
        requireStr('campaign_id');
        requireStr('title');
        break;
      }
    }
  }

  // =========================================================================
  // PostgREST (/rest/v1/<table>)
  // =========================================================================
  private async handleRest(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const caller = this.resolveCaller(req);
    if (caller.tokenError) {
      throw new PostgrestError(caller.tokenError.status, caller.tokenError.code, caller.tokenError.message);
    }

    const table = url.pathname.slice('/rest/v1/'.length).replace(/\/+$/, '');
    if (!ALL_TABLES.has(table)) {
      throw new PostgrestError(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`);
    }

    const method = (req.method ?? 'GET').toUpperCase();
    const preferHeader = typeof req.headers.prefer === 'string' ? req.headers.prefer : '';
    const acceptHeader = typeof req.headers.accept === 'string' ? req.headers.accept : '';
    const wantsSingleObject = acceptHeader.includes('application/vnd.pgrst.object+json');
    const wantsRepresentation = preferHeader.includes('return=representation');
    const wantsExactCount = preferHeader.includes('count=exact') || preferHeader.includes('count=planned');
    const wantsMergeDuplicates = preferHeader.includes('resolution=merge-duplicates');
    const wantsIgnoreDuplicates = preferHeader.includes('resolution=ignore-duplicates');

    if (method === 'GET' || method === 'HEAD') {
      const allRows = this.tables.get(table)!;
      const visible = allRows
        .filter((r) => this.canSelectRow(table, r, caller))
        .map((r) => this.sanitizeRowForCaller(table, r, caller));
      const filtered = this.applyQueryFilters(visible, url.searchParams);
      const ordered = this.applyOrder(filtered, url.searchParams.get('order'));
      const totalCount = ordered.length;
      const sliced = this.applyRangeAndPagination(ordered, url.searchParams, req.headers.range);

      const selectSpec = url.searchParams.get('select') ?? '*';
      const projected = sliced.map((r) => this.projectRow(table, r, selectSpec, caller));

      const headers: Record<string, string> = {};
      if (wantsExactCount) {
        const rangeStr =
          projected.length === 0 ? `*/${totalCount}` : `0-${projected.length - 1}/${totalCount}`;
        headers['Content-Range'] = rangeStr;
      }

      if (method === 'HEAD') {
        this.applyCorsHeaders(res);
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        res.writeHead(200);
        res.end();
        return;
      }

      if (wantsSingleObject) {
        if (projected.length !== 1) {
          throw new PostgrestError(
            406,
            'PGRST116',
            'JSON object requested, multiple (or no) rows returned',
            `The result contains ${projected.length} rows`,
          );
        }
        this.sendJson(res, 200, projected[0], headers);
        return;
      }

      this.sendJson(res, 200, projected, headers);
      return;
    }

    if (method === 'POST') {
      const body = await this.readJsonBody(req);
      const inputs: Row[] = Array.isArray(body) ? (body as Row[]) : [body as Row];
      const onConflictParam = url.searchParams.get('on_conflict');
      const conflictCols = onConflictParam
        ? onConflictParam.split(',').map((c) => c.trim()).filter(Boolean)
        : this.getDefaultConflictCols(table);
      const tableRows = this.tables.get(table)!;
      const affected: Row[] = [];

      for (const rawInput of inputs) {
        const input = cloneRow(rawInput);
        const prepared = this.prepareInsertRow(table, input, caller);
        const existingIdx = tableRows.findIndex((row) =>
          conflictCols.every((col) => prepared[col] !== undefined && row[col] === prepared[col]),
        );

        if (existingIdx !== -1 && (wantsMergeDuplicates || wantsIgnoreDuplicates)) {
          if (wantsIgnoreDuplicates) {
            continue;
          }
          const existing = tableRows[existingIdx];
          this.assertCanUpdateOrDelete('UPDATE', table, existing, input, caller);
          const merged: Row = {
            ...existing,
            ...input,
          };
          if (TABLES_WITH_UPDATED_AT.has(table)) {
            merged.updated_at = input.updated_at ?? nowIso();
          }
          this.validateRowConstraints(table, merged, existing);
          if (table === 'worlds') {
            this.checkWorldTriggers(existing, merged);
          }
          if (table === 'characters') {
            this.checkCharacterTriggers(merged);
          }
          const prev = cloneRow(existing);
          tableRows[existingIdx] = merged;
          affected.push(merged);
          this.emitPostgresChange('UPDATE', table, merged, prev);
        } else {
          this.assertCanInsert(table, prepared, caller);
          if (existingIdx !== -1) {
            throw new PostgrestError(409, '23505', `duplicate key value violates unique constraint on "${table}"`);
          }
          this.validateRowConstraints(table, prepared, null);
          if (table === 'characters') {
            this.checkCharacterTriggers(prepared);
          }
          tableRows.push(prepared);
          affected.push(prepared);
          this.emitPostgresChange('INSERT', table, prepared, null);

          // Trigger: on_world_created (schema.sql:189-211)
          if (table === 'worlds') {
            const ownerId = typeof prepared.owner_id === 'string' ? prepared.owner_id : caller.userId;
            if (ownerId) {
              const members = this.tables.get('campaign_members')!;
              const existingMember = members.find(
                (m) => m.campaign_id === prepared.id && m.user_id === ownerId,
              );
              if (existingMember) {
                const prevMember = cloneRow(existingMember);
                existingMember.role = 'gm';
                this.emitPostgresChange('UPDATE', 'campaign_members', existingMember, prevMember);
              } else {
                const memberRow: Row = {
                  campaign_id: prepared.id,
                  user_id: ownerId,
                  role: 'gm',
                  joined_at: nowIso(),
                };
                members.push(memberRow);
                this.emitPostgresChange('INSERT', 'campaign_members', memberRow, null);
              }
            }
          }
        }
      }

      if (!wantsRepresentation && !wantsSingleObject) {
        this.sendJson(res, 201, null, {});
        res.end();
        return;
      }

      const selectSpec = url.searchParams.get('select') ?? '*';
      const projected = affected.map((r) =>
        this.projectRow(table, this.sanitizeRowForCaller(table, r, caller), selectSpec, caller),
      );
      if (wantsSingleObject) {
        if (projected.length !== 1) {
          throw new PostgrestError(
            406,
            'PGRST116',
            'JSON object requested, multiple (or no) rows returned',
            `The result contains ${projected.length} rows`,
          );
        }
        this.sendJson(res, 201, projected[0]);
        return;
      }
      this.sendJson(res, 201, projected);
      return;
    }

    if (method === 'PATCH') {
      const patch = (await this.readJsonBody(req)) as Row;
      const tableRows = this.tables.get(table)!;
      const matched = this.applyQueryFilters(tableRows, url.searchParams);
      const updatedRows: Row[] = [];

      for (const existing of matched) {
        if (!this.canSelectRow(table, existing, caller) && caller.role !== 'service_role') {
          if (GM_ONLY_MUTATION_TABLES.has(table) && this.isCampaignMember(this.getCampaignIdForRow(table, existing), caller)) {
            throw new PostgrestError(403, '42501', `permission denied for table ${table}`);
          }
          continue;
        }
        this.assertCanUpdateOrDelete('UPDATE', table, existing, patch, caller);
        const prev = cloneRow(existing);
        const nextRow: Row = {
          ...existing,
          ...cloneRow(patch),
        };
        if (TABLES_WITH_UPDATED_AT.has(table)) {
          nextRow.updated_at = patch.updated_at ?? nowIso();
        }
        this.validateRowConstraints(table, nextRow, existing);
        if (table === 'worlds') {
          this.checkWorldTriggers(existing, nextRow);
        }
        if (table === 'characters') {
          this.checkCharacterTriggers(nextRow);
        }
        const idx = tableRows.indexOf(existing);
        tableRows[idx] = nextRow;
        updatedRows.push(nextRow);
        this.emitPostgresChange('UPDATE', table, nextRow, prev);
      }

      if (!wantsRepresentation && !wantsSingleObject) {
        this.sendJson(res, 204, null);
        return;
      }
      const selectSpec = url.searchParams.get('select') ?? '*';
      const projected = updatedRows.map((r) =>
        this.projectRow(table, this.sanitizeRowForCaller(table, r, caller), selectSpec, caller),
      );
      if (wantsSingleObject) {
        if (projected.length !== 1) {
          throw new PostgrestError(
            406,
            'PGRST116',
            'JSON object requested, multiple (or no) rows returned',
            `The result contains ${projected.length} rows`,
          );
        }
        this.sendJson(res, 200, projected[0]);
        return;
      }
      this.sendJson(res, 200, projected);
      return;
    }

    if (method === 'DELETE') {
      const tableRows = this.tables.get(table)!;
      const matched = this.applyQueryFilters(tableRows, url.searchParams);
      const deletedRows: Row[] = [];

      for (const existing of matched) {
        if (!this.canSelectRow(table, existing, caller) && caller.role !== 'service_role') {
          if (GM_ONLY_MUTATION_TABLES.has(table) && this.isCampaignMember(this.getCampaignIdForRow(table, existing), caller)) {
            throw new PostgrestError(403, '42501', `permission denied for table ${table}`);
          }
          continue;
        }
        this.assertCanUpdateOrDelete('DELETE', table, existing, null, caller);
        const idx = tableRows.indexOf(existing);
        if (idx !== -1) {
          tableRows.splice(idx, 1);
          deletedRows.push(existing);
          this.emitPostgresChange('DELETE', table, null, existing);

          // Trigger: trg_guild_quest_signup_deleted (schema.sql:747-784)
          if (table === 'guild_quest_signups') {
            const quest = (this.tables.get('guild_quests') ?? []).find((q) => q.id === existing.quest_id);
            if (quest && quest.status === 'full') {
              const remaining = tableRows.filter((s) => s.quest_id === existing.quest_id).length;
              const maxPlayers = typeof quest.max_players === 'number' ? quest.max_players : Number(quest.max_players ?? 5);
              if (remaining < maxPlayers) {
                const prevQuest = cloneRow(quest);
                quest.status = 'open';
                quest.updated_at = nowIso();
                this.emitPostgresChange('UPDATE', 'guild_quests', quest, prevQuest);
              }
            }
          }
        }
      }

      if (!wantsRepresentation && !wantsSingleObject) {
        this.sendJson(res, 204, null);
        return;
      }
      const selectSpec = url.searchParams.get('select') ?? '*';
      const projected = deletedRows.map((r) =>
        this.projectRow(table, this.sanitizeRowForCaller(table, r, caller), selectSpec, caller),
      );
      if (wantsSingleObject) {
        if (projected.length !== 1) {
          throw new PostgrestError(
            406,
            'PGRST116',
            'JSON object requested, multiple (or no) rows returned',
            `The result contains ${projected.length} rows`,
          );
        }
        this.sendJson(res, 200, projected[0]);
        return;
      }
      this.sendJson(res, 200, projected);
      return;
    }

    this.sendJson(res, 405, { code: '405', message: `Method ${method} not allowed` });
  }

  private prepareInsertRow(table: string, input: Row, caller: CallerContext): Row {
    const now = nowIso();
    const row: Row = { ...input };

    if (TABLES_WITH_ID.has(table)) {
      row.id = typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID();
    }
    if (TABLES_WITH_CREATED_AT.has(table)) {
      row.created_at = input.created_at ?? now;
    }
    if (TABLES_WITH_UPDATED_AT.has(table)) {
      row.updated_at = input.updated_at ?? now;
    }

    if (table === 'worlds') {
      if (!row.owner_id && caller.userId) row.owner_id = caller.userId;
      if (row.description === undefined) row.description = '';
      if (!row.mode) row.mode = 'normal';
      if (!row.invite_code) row.invite_code = randomInviteCode();
      if (row.max_players_per_party === undefined) row.max_players_per_party = 5;
    } else if (table === 'campaign_members') {
      if (!row.role) row.role = 'player';
      if (!row.joined_at) row.joined_at = now;
    } else if (table === 'entities') {
      if (row.type === undefined) row.type = 'Location';
      if (row.category === undefined) row.category = 'encyclopedia';
      if (row.tags === undefined) row.tags = [];
      if (row.summary === undefined) row.summary = '';
      if (row.content === undefined) row.content = '';
      if (row.gm_secrets === undefined) row.gm_secrets = '';
      if (row.metadata === undefined) row.metadata = {};
      if (row.is_favorite === undefined) row.is_favorite = false;
    } else if (table === 'maps') {
      if (!row.kind) row.kind = '3d';
    } else if (table === 'map_pins') {
      if (row.icon_type === undefined) row.icon_type = 'settlement';
      if (row.is_gm_only === undefined) row.is_gm_only = false;
    } else if (table === 'map_paths') {
      if (row.points === undefined) row.points = [];
      if (row.style === undefined) row.style = 'dashed-gold';
      if (row.is_gm_only === undefined) row.is_gm_only = false;
    } else if (table === 'vault_assets') {
      if (row.kind === undefined) row.kind = 'portrait';
    } else if (table === 'characters') {
      if (!row.user_id && caller.userId) row.user_id = caller.userId;
      if (row.is_active === undefined) row.is_active = true;
      if (!row.attributes) row.attributes = {};
    } else if (table === 'journal_pages') {
      if (!row.owner_id && caller.userId) row.owner_id = caller.userId;
      if (row.content === undefined) row.content = '';
      if (row.tags === undefined) row.tags = [];
      if (!row.share_scope) row.share_scope = 'private';
    } else if (table === 'journal_page_shares') {
      if (row.can_edit === undefined) row.can_edit = false;
    } else if (table === 'map_quest_boards') {
      if (row.description === undefined) row.description = '';
      if (row.x === undefined) row.x = 0;
      if (row.y === undefined) row.y = 0;
      if (row.z === undefined) row.z = 0;
      if (!row.created_by && caller.userId) row.created_by = caller.userId;
    } else if (table === 'guild_quests') {
      if (row.summary === undefined) row.summary = '';
      if (row.danger_tier === undefined) row.danger_tier = 'Standard';
      if (row.reward === undefined) row.reward = '';
      if (row.max_players === undefined) row.max_players = 5;
      if (!row.status) row.status = 'open';
      if (!row.created_by && caller.userId) row.created_by = caller.userId;
    } else if (table === 'guild_quest_signups') {
      if (!row.user_id && caller.userId) row.user_id = caller.userId;
      if (row.note === undefined) row.note = '';
      if (!row.signed_up_at) row.signed_up_at = now;
    } else if (table === 'dice_rolls') {
      if (!row.user_id && caller.userId) row.user_id = caller.userId;
      if (row.label === undefined) row.label = '';
      if (row.breakdown === undefined) row.breakdown = {};
      if (row.is_gm_blind === undefined) row.is_gm_blind = false;
    } else if (table === 'map_fog_states') {
      if (row.mask_url === undefined) row.mask_url = '';
    } else if (table === 'map_fog_shares') {
      if (row.share_all === undefined) row.share_all = false;
    } else if (table === 'timeline_events') {
      if (row.date_label === undefined) row.date_label = '';
      if (row.sort_order === undefined) row.sort_order = 0;
      if (row.era === undefined) row.era = '';
      if (row.description === undefined) row.description = '';
      if (row.is_gm_only === undefined) row.is_gm_only = false;
      if (!row.created_by && caller.userId) row.created_by = caller.userId;
    }

    return row;
  }

  // =========================================================================
  // PostgREST Query Filtering, Ordering, Pagination & Embedded Joins
  // =========================================================================
  private applyQueryFilters(rows: Row[], params: URLSearchParams): Row[] {
    const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
    const predicates: Array<(row: Row) => boolean> = [];

    for (const [key, value] of params.entries()) {
      if (reserved.has(key)) continue;
      if (key === 'or' || key === 'and') {
        const inner = value.startsWith('(') && value.endsWith(')') ? value.slice(1, -1) : value;
        const parts = this.splitTopLevel(inner, ',');
        const subPreds = parts.map((part) => this.buildBooleanExpressionPredicate(part));
        predicates.push((row) => (key === 'or' ? subPreds.some((p) => p(row)) : subPreds.every((p) => p(row))));
        continue;
      }
      predicates.push(this.buildColumnPredicate(key, value));
    }

    return rows.filter((row) => predicates.every((p) => p(row)));
  }

  private splitTopLevel(expr: string, delimiter: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let inQuotes = false;
    let cur = '';
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === '"' && expr[i - 1] !== '\\') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (ch === '(' || ch === '{') depth++;
        else if (ch === ')' || ch === '}') depth--;
        else if (ch === delimiter && depth === 0) {
          out.push(cur.trim());
          cur = '';
          continue;
        }
      }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  private buildBooleanExpressionPredicate(expr: string): (row: Row) => boolean {
    if (expr.startsWith('and(') && expr.endsWith(')')) {
      const inner = expr.slice(4, -1);
      const sub = this.splitTopLevel(inner, ',').map((p) => this.buildBooleanExpressionPredicate(p));
      return (row) => sub.every((p) => p(row));
    }
    if (expr.startsWith('or(') && expr.endsWith(')')) {
      const inner = expr.slice(3, -1);
      const sub = this.splitTopLevel(inner, ',').map((p) => this.buildBooleanExpressionPredicate(p));
      return (row) => sub.some((p) => p(row));
    }
    const dotIdx = expr.indexOf('.');
    if (dotIdx === -1) return () => true;
    const col = expr.slice(0, dotIdx);
    const opAndVal = expr.slice(dotIdx + 1);
    return this.buildColumnPredicate(col, opAndVal);
  }

  private buildColumnPredicate(col: string, rawFilter: string): (row: Row) => boolean {
    let negated = false;
    let filter = rawFilter;
    if (filter.startsWith('not.')) {
      negated = true;
      filter = filter.slice(4);
    }

    const dotIdx = filter.indexOf('.');
    if (dotIdx === -1) return () => true;
    const op = filter.slice(0, dotIdx);
    const valStr = filter.slice(dotIdx + 1);

    const basePred = (row: Row): boolean => {
      const actual = this.readPath(row, col);
      switch (op) {
        case 'eq':
          return this.coerceCompareEqual(actual, valStr);
        case 'neq':
          return !this.coerceCompareEqual(actual, valStr);
        case 'gt':
          return this.compareOrdered(actual, valStr) > 0;
        case 'gte':
          return this.compareOrdered(actual, valStr) >= 0;
        case 'lt':
          return this.compareOrdered(actual, valStr) < 0;
        case 'lte':
          return this.compareOrdered(actual, valStr) <= 0;
        case 'is':
          if (valStr === 'null') return actual === null || actual === undefined;
          if (valStr === 'true') return actual === true;
          if (valStr === 'false') return actual === false;
          return actual === valStr;
        case 'in': {
          const inner = valStr.startsWith('(') && valStr.endsWith(')') ? valStr.slice(1, -1) : valStr;
          if (!inner) return false;
          const items = this.splitTopLevel(inner, ',').map((item) =>
            item.startsWith('"') && item.endsWith('"') ? item.slice(1, -1) : item,
          );
          return items.some((item) => this.coerceCompareEqual(actual, item));
        }
        case 'like':
        case 'ilike': {
          if (typeof actual !== 'string') return false;
          const pattern = valStr
            .replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '*' ? '.*' : `\\${m}`))
            .replace(/%/g, '.*')
            .replace(/_/g, '.');
          const flags = op === 'ilike' ? 'i' : '';
          return new RegExp(`^${pattern}$`, flags).test(actual);
        }
        case 'cs': {
          const inner = valStr.startsWith('{') && valStr.endsWith('}') ? valStr.slice(1, -1) : valStr;
          const items = inner ? this.splitTopLevel(inner, ',') : [];
          if (!Array.isArray(actual)) return false;
          return items.every((item) => actual.some((a) => this.coerceCompareEqual(a, item)));
        }
        case 'cd': {
          const inner = valStr.startsWith('{') && valStr.endsWith('}') ? valStr.slice(1, -1) : valStr;
          const items = inner ? this.splitTopLevel(inner, ',') : [];
          if (!Array.isArray(actual)) return false;
          return actual.every((a) => items.some((item) => this.coerceCompareEqual(a, item)));
        }
        default:
          return true;
      }
    };

    return negated ? (row) => !basePred(row) : basePred;
  }

  private readPath(row: Row, col: string): unknown {
    if (Object.prototype.hasOwnProperty.call(row, col)) {
      return row[col];
    }
    if (col.includes('->>') || col.includes('->')) {
      const normalized = col.replace(/->>/g, '.').replace(/->/g, '.');
      let cur: unknown = row;
      for (const part of normalized.split('.')) {
        if (cur && typeof cur === 'object') {
          cur = (cur as Record<string, unknown>)[part];
        } else {
          return undefined;
        }
      }
      return cur;
    }
    return undefined;
  }

  private coerceCompareEqual(actual: unknown, expectedStr: string): boolean {
    if (actual === null || actual === undefined) return false;
    if (typeof actual === 'boolean') {
      return String(actual) === expectedStr;
    }
    if (typeof actual === 'number') {
      const n = Number(expectedStr);
      return !Number.isNaN(n) && actual === n;
    }
    return String(actual) === expectedStr;
  }

  private compareOrdered(actual: unknown, expectedStr: string): number {
    if (actual === null || actual === undefined) return -1;
    if (typeof actual === 'number') {
      return actual - Number(expectedStr);
    }
    return String(actual).localeCompare(expectedStr);
  }

  private applyOrder(rows: Row[], orderParam: string | null): Row[] {
    if (!orderParam) return rows;
    const specs = orderParam.split(',').map((s) => {
      const parts = s.trim().split('.');
      return {
        col: parts[0],
        desc: parts.includes('desc'),
      };
    });
    return [...rows].sort((a, b) => {
      for (const spec of specs) {
        const av = a[spec.col];
        const bv = b[spec.col];
        if (av === bv) continue;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        let cmp = 0;
        if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv;
        } else {
          cmp = String(av).localeCompare(String(bv));
        }
        if (cmp !== 0) return spec.desc ? -cmp : cmp;
      }
      return 0;
    });
  }

  private applyRangeAndPagination(
    rows: Row[],
    params: URLSearchParams,
    rangeHeader: string | undefined,
  ): Row[] {
    let start = 0;
    let end = rows.length;
    const offsetParam = params.get('offset');
    const limitParam = params.get('limit');
    if (offsetParam !== null) {
      start = Math.max(0, Number.parseInt(offsetParam, 10) || 0);
    }
    if (limitParam !== null) {
      const lim = Math.max(0, Number.parseInt(limitParam, 10) || 0);
      end = Math.min(rows.length, start + lim);
    } else if (rangeHeader) {
      const m = /^(\d+)-(\d+)$/.exec(rangeHeader.trim());
      if (m) {
        start = Number.parseInt(m[1], 10);
        end = Math.min(rows.length, Number.parseInt(m[2], 10) + 1);
      }
    }
    return rows.slice(start, end);
  }

  private projectRow(table: string, row: Row, selectSpec: string, caller: CallerContext): Row {
    const trimmed = selectSpec.trim();
    if (!trimmed || trimmed === '*') return cloneRow(row);

    const fields = this.splitTopLevel(trimmed, ',');
    const includeAll = fields.includes('*');
    const result: Row = includeAll ? cloneRow(row) : {};

    for (const field of fields) {
      if (field === '*') continue;
      const parenIdx = field.indexOf('(');
      if (parenIdx !== -1 && field.endsWith(')')) {
        const prefix = field.slice(0, parenIdx).trim();
        const innerSelect = field.slice(parenIdx + 1, -1);
        const [aliasOrTable] = prefix.split('!');
        const [alias, explicitTarget] = aliasOrTable.includes(':')
          ? aliasOrTable.split(':')
          : [aliasOrTable, aliasOrTable];
        const targetTable = explicitTarget.trim();
        if (ALL_TABLES.has(targetTable)) {
          result[alias.trim()] = this.resolveEmbeddedRelation(
            table,
            row,
            targetTable,
            innerSelect,
            caller,
          );
        }
        continue;
      }
      const [alias, colName] = field.includes(':') ? field.split(':') : [field, field];
      const cleanCol = colName.trim();
      const cleanAlias = alias.trim();
      if (Object.prototype.hasOwnProperty.call(row, cleanCol)) {
        result[cleanAlias] = cloneRow({ v: row[cleanCol] }).v;
      } else {
        result[cleanAlias] = null;
      }
    }

    return result;
  }

  private resolveEmbeddedRelation(
    parentTable: string,
    parentRow: Row,
    targetTable: string,
    innerSelect: string,
    caller: CallerContext,
  ): unknown {
    const targetRows = (this.tables.get(targetTable) ?? [])
      .filter((r) => this.canSelectRow(targetTable, r, caller))
      .map((r) => this.sanitizeRowForCaller(targetTable, r, caller));

    // Many-to-one lookups (parent has FK pointing to target.id)
    const manyToOneFkMap: Record<string, Record<string, string[]>> = {
      campaign_members: { profiles: ['user_id'], worlds: ['campaign_id'] },
      characters: {
        profiles: ['user_id'],
        worlds: ['campaign_id'],
        character_sheet_templates: ['sheet_template_id'],
        entities: ['entity_id'],
      },
      entities: { worlds: ['world_id'] },
      maps: { worlds: ['world_id'] },
      map_quest_boards: { maps: ['map_id'], worlds: ['campaign_id'] },
      guild_quest_signups: {
        profiles: ['user_id'],
        characters: ['character_id'],
        guild_quests: ['quest_id'],
      },
      guild_quests: { map_quest_boards: ['board_id'], worlds: ['campaign_id'], entities: ['linked_entity_id'] },
      journal_pages: { profiles: ['owner_id'], worlds: ['campaign_id'] },
      journal_page_shares: { profiles: ['shared_with_user_id'], journal_pages: ['page_id'] },
      map_fog_states: { profiles: ['user_id'], maps: ['map_id'] },
      map_fog_shares: { profiles: ['owner_user_id', 'shared_with_user_id'], maps: ['map_id'] },
      dice_rolls: { profiles: ['user_id'], characters: ['character_id'] },
      timeline_events: { entities: ['linked_entity_id'] },
      map_pins: { entities: ['entity_id'], maps: ['map_id'] },
      map_paths: { maps: ['map_id'] },
    };

    const fkCols = manyToOneFkMap[parentTable]?.[targetTable];
    if (fkCols) {
      for (const fk of fkCols) {
        const fkVal = parentRow[fk];
        if (typeof fkVal === 'string') {
          const match = targetRows.find((r) => r.id === fkVal);
          return match ? this.projectRow(targetTable, match, innerSelect, caller) : null;
        }
      }
      return null;
    }

    // One-to-many lookups (target has FK pointing to parent.id)
    const oneToManyFkMap: Record<string, Record<string, string>> = {
      worlds: {
        campaign_members: 'campaign_id',
        characters: 'campaign_id',
        character_sheet_templates: 'campaign_id',
        maps: 'world_id',
        entities: 'world_id',
        entity_links: 'world_id',
        vault_assets: 'world_id',
        entity_templates: 'world_id',
        guild_quests: 'campaign_id',
        timeline_events: 'campaign_id',
      },
      guild_quests: { guild_quest_signups: 'quest_id' },
      map_quest_boards: { guild_quests: 'board_id' },
      journal_pages: { journal_page_shares: 'page_id' },
      maps: {
        map_pins: 'map_id',
        map_paths: 'map_id',
        map_fog_states: 'map_id',
        map_quest_boards: 'map_id',
      },
      entities: { map_pins: 'entity_id', timeline_events: 'linked_entity_id' },
    };

    const childFk = oneToManyFkMap[parentTable]?.[targetTable];
    if (childFk) {
      return targetRows
        .filter((r) => r[childFk] === parentRow.id)
        .map((r) => this.projectRow(targetTable, r, innerSelect, caller));
    }

    return [];
  }

  // =========================================================================
  // RPCs (/rest/v1/rpc/*)
  // =========================================================================
  private async handleRpc(req: http.IncomingMessage, res: http.ServerResponse, rpcName: string): Promise<void> {
    if ((req.method ?? 'POST').toUpperCase() !== 'POST') {
      throw new PostgrestError(405, '405', 'RPC requires POST');
    }
    const caller = this.resolveCaller(req);
    if (caller.tokenError) {
      throw new PostgrestError(caller.tokenError.status, caller.tokenError.code, caller.tokenError.message);
    }
    if (caller.role !== 'authenticated' || !caller.userId) {
      throw new PostgrestError(401, '42501', 'Authentication required for RPC');
    }

    const body = (await this.readJsonBody(req)) as Record<string, unknown>;
    const uid = caller.userId;

    if (rpcName === 'join_campaign_by_invite') {
      const rawCode = typeof body.p_invite_code === 'string' ? body.p_invite_code.trim() : '';
      if (!rawCode) {
        throw new PostgrestError(400, 'P0002', 'Invite code is required');
      }
      const worlds = this.tables.get('worlds')!;
      const world = worlds.find(
        (w) => typeof w.invite_code === 'string' && w.invite_code.toLowerCase() === rawCode.toLowerCase(),
      );
      if (!world) {
        throw new PostgrestError(404, 'P0002', 'Invalid campaign invite code');
      }

      const members = this.tables.get('campaign_members')!;
      const existing = members.find((m) => m.campaign_id === world.id && m.user_id === uid);
      if (!existing) {
        const now = nowIso();
        const memberRow: Row = {
          campaign_id: world.id,
          user_id: uid,
          role: 'player',
          joined_at: now,
        };
        members.push(memberRow);
        this.emitPostgresChange('INSERT', 'campaign_members', memberRow, null);
      }

      this.sendJson(res, 200, world.id);
      return;
    }

    if (rpcName === 'signup_for_guild_quest') {
      // Execute synchronously without awaits to simulate PostgreSQL FOR UPDATE row lock
      const questId = typeof body.p_quest_id === 'string' ? body.p_quest_id : '';
      const characterId = typeof body.p_character_id === 'string' ? body.p_character_id : '';
      const note = typeof body.p_note === 'string' ? body.p_note : '';

      const quests = this.tables.get('guild_quests')!;
      const quest = quests.find((q) => q.id === questId);
      if (!quest) {
        throw new PostgrestError(404, 'P0002', 'Guild quest not found');
      }
      if (!this.isCampaignMember(quest.campaign_id, caller)) {
        throw new PostgrestError(403, '42501', 'Only campaign members can sign up for quests');
      }
      if (quest.status !== 'open') {
        throw new PostgrestError(409, 'P0001', `Quest is not open for signup (status: ${String(quest.status)})`);
      }

      const chars = this.tables.get('characters')!;
      const char = chars.find(
        (c) =>
          c.id === characterId &&
          c.campaign_id === quest.campaign_id &&
          c.user_id === uid &&
          c.is_active === true,
      );
      if (!char) {
        throw new PostgrestError(403, 'P0001', 'Character must be an active character owned by you in this campaign');
      }

      const signups = this.tables.get('guild_quest_signups')!;
      if (signups.some((s) => s.quest_id === questId && s.user_id === uid)) {
        throw new PostgrestError(409, '23505', 'You have already signed up for this quest');
      }

      const currentSignups = signups.filter((s) => s.quest_id === questId);
      const maxPlayers = typeof quest.max_players === 'number' ? quest.max_players : Number(quest.max_players ?? 5);
      if (currentSignups.length >= maxPlayers) {
        throw new PostgrestError(409, 'P0001', 'Quest party is already full');
      }

      const now = nowIso();
      const signupRow: Row = {
        id: crypto.randomUUID(),
        quest_id: questId,
        campaign_id: quest.campaign_id,
        user_id: uid,
        character_id: characterId,
        note,
        signed_up_at: now,
      };
      signups.push(signupRow);
      this.emitPostgresChange('INSERT', 'guild_quest_signups', signupRow, null);

      if (currentSignups.length + 1 >= maxPlayers) {
        const prevQuest = cloneRow(quest);
        quest.status = 'full';
        quest.updated_at = now;
        this.emitPostgresChange('UPDATE', 'guild_quests', quest, prevQuest);
      }

      this.sendJson(res, 200, signupRow.id);
      return;
    }

    if (rpcName === 'withdraw_from_guild_quest') {
      const questId = typeof body.p_quest_id === 'string' ? body.p_quest_id : '';
      const quests = this.tables.get('guild_quests')!;
      const quest = quests.find((q) => q.id === questId);
      if (!quest) {
        throw new PostgrestError(404, 'P0002', 'Guild quest not found');
      }
      if (!this.isCampaignMember(quest.campaign_id, caller)) {
        throw new PostgrestError(403, '42501', 'Only campaign members can withdraw from quests');
      }
      if (
        (quest.status === 'in_progress' || quest.status === 'completed' || quest.status === 'archived') &&
        !this.isCampaignGm(quest.campaign_id, caller)
      ) {
        throw new PostgrestError(403, '42501', `Cannot withdraw while quest status is ${String(quest.status)}`);
      }

      const signups = this.tables.get('guild_quest_signups')!;
      const idx = signups.findIndex((s) => s.quest_id === questId && s.user_id === uid);
      if (idx !== -1) {
        const [removed] = signups.splice(idx, 1);
        this.emitPostgresChange('DELETE', 'guild_quest_signups', null, removed);
      }

      const remaining = signups.filter((s) => s.quest_id === questId).length;
      const maxPlayers = typeof quest.max_players === 'number' ? quest.max_players : Number(quest.max_players ?? 5);
      if (quest.status === 'full' && remaining < maxPlayers) {
        const prevQuest = cloneRow(quest);
        quest.status = 'open';
        quest.updated_at = nowIso();
        this.emitPostgresChange('UPDATE', 'guild_quests', quest, prevQuest);
      }

      this.sendJson(res, 204, null);
      return;
    }

    if (rpcName === 'move_my_battlemap_token') {
      const mapId = typeof body.p_map_id === 'string' ? body.p_map_id : '';
      const tokenId = typeof body.p_token_id === 'string' ? body.p_token_id : '';
      const x = typeof body.p_x === 'number' ? body.p_x : Number(body.p_x);
      const y = typeof body.p_y === 'number' ? body.p_y : Number(body.p_y);

      if (!tokenId.trim()) {
        throw new PostgrestError(400, 'P0001', 'Token ID cannot be empty');
      }
      if (body.p_x === null || body.p_x === undefined || body.p_y === null || body.p_y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
        throw new PostgrestError(400, 'P0001', 'Token coordinates must be finite numbers');
      }

      const maps = this.tables.get('maps')!;
      const mapRow = maps.find((m) => m.id === mapId);
      if (!mapRow) {
        throw new PostgrestError(404, 'P0002', 'Map not found');
      }
      if (!this.isCampaignMember(mapRow.world_id, caller)) {
        throw new PostgrestError(403, '42501', 'Only campaign members can interact with this map');
      }

      const battlemap = mapRow.battlemap;
      if (!battlemap || typeof battlemap !== 'object' || Array.isArray(battlemap) || !Array.isArray((battlemap as Row).tokens)) {
        throw new PostgrestError(400, 'P0001', 'Battlemap token list not found');
      }

      const tokens = (battlemap as Row).tokens as Row[];
      const targetToken = tokens.find((t) => t && typeof t === 'object' && t.id === tokenId);
      if (!targetToken) {
        throw new PostgrestError(404, 'P0002', 'Token not found on battlemap');
      }

      const isGm = this.isCampaignGm(mapRow.world_id, caller);
      let authorized = isGm;
      if (!authorized && targetToken.owner_user_id === uid) {
        authorized = true;
      }
      if (!authorized && typeof targetToken.character_id === 'string' && targetToken.character_id !== '') {
        authorized = (this.tables.get('characters') ?? []).some(
          (c) => c.id === targetToken.character_id && c.campaign_id === mapRow.world_id && c.user_id === uid,
        );
      }
      if (!authorized) {
        throw new PostgrestError(403, '42501', 'You do not have permission to move this token');
      }
      if (!isGm && targetToken.isHidden === true) {
        throw new PostgrestError(403, '42501', 'Hidden tokens can only be moved by a GM.');
      }

      const prevMap = cloneRow(mapRow);
      const updatedTokens = tokens.map((t) => (t && typeof t === 'object' && t.id === tokenId ? { ...t, x, y } : t));
      mapRow.battlemap = { ...(battlemap as Row), tokens: updatedTokens };
      this.emitPostgresChange('UPDATE', 'maps', mapRow, prevMap);

      this.sendJson(res, 204, null);
      return;
    }

    throw new PostgrestError(404, 'PGRST202', `Could not find the function public.${rpcName}`);
  }

  // =========================================================================
  // Storage (/storage/v1/*)
  // =========================================================================
  private async handleStorage(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const path = url.pathname.slice('/storage/v1'.length);
    const caller = this.resolveCaller(req);

    // Public GET: /object/public/vault-assets/<objectPath>
    if (method === 'GET' && path.startsWith('/object/public/vault-assets/')) {
      const objectPath = decodeURIComponent(path.slice('/object/public/vault-assets/'.length));
      const obj = this.storage.get(`vault-assets/${objectPath}`);
      if (!obj) {
        this.sendJson(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        return;
      }
      this.applyCorsHeaders(res);
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader('Content-Length', String(obj.data.length));
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.writeHead(200);
      res.end(obj.data);
      return;
    }

    // Authenticated GET: /object/vault-assets/<objectPath>
    if (method === 'GET' && path.startsWith('/object/vault-assets/')) {
      if (caller.role !== 'authenticated' && caller.role !== 'service_role') {
        this.sendJson(res, 401, { statusCode: '401', error: 'Unauthorized', message: 'JWT required' });
        return;
      }
      const objectPath = decodeURIComponent(path.slice('/object/vault-assets/'.length));
      const obj = this.storage.get(`vault-assets/${objectPath}`);
      if (!obj) {
        this.sendJson(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        return;
      }
      this.applyCorsHeaders(res);
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader('Content-Length', String(obj.data.length));
      res.writeHead(200);
      res.end(obj.data);
      return;
    }

    // Upload: POST or PUT /object/vault-assets/<objectPath>
    if ((method === 'POST' || method === 'PUT') && path.startsWith('/object/vault-assets/')) {
      if (caller.role !== 'authenticated' && caller.role !== 'service_role') {
        this.sendJson(res, 403, {
          statusCode: '403',
          error: 'Unauthorized',
          message: 'new row violates row-level security policy',
        });
        return;
      }
      const objectPath = decodeURIComponent(path.slice('/object/vault-assets/'.length));
      const key = `vault-assets/${objectPath}`;
      const upsert = String(req.headers['x-upsert'] ?? '').toLowerCase() === 'true';
      if (!upsert && method === 'POST' && this.storage.has(key)) {
        this.sendJson(res, 409, {
          statusCode: '409',
          error: 'Duplicate',
          message: 'The resource already exists',
        });
        return;
      }

      const rawBody = await this.readRawBody(req);
      const reqContentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : '';
      let data = rawBody;
      let contentType = reqContentType || 'application/octet-stream';

      if (reqContentType.includes('multipart/form-data')) {
        const parsed = this.extractMultipartFile(rawBody, reqContentType);
        if (parsed) {
          data = parsed.data;
          contentType = parsed.contentType || 'application/octet-stream';
        }
      }

      const now = nowIso();
      this.storage.set(key, {
        bucket: 'vault-assets',
        path: objectPath,
        contentType,
        data,
        ownerId: caller.userId ?? 'service_role',
        createdAt: now,
        updatedAt: now,
      });

      this.sendJson(res, 200, { Key: key, Id: crypto.randomUUID() });
      return;
    }

    // Delete batch: DELETE /object/vault-assets
    if (method === 'DELETE' && path === '/object/vault-assets') {
      if (caller.role !== 'authenticated' && caller.role !== 'service_role') {
        this.sendJson(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'Authentication required' });
        return;
      }
      const body = (await this.readJsonBody(req)) as { prefixes?: string[] };
      const prefixes = Array.isArray(body.prefixes) ? body.prefixes : [];
      const deleted: Array<{ name: string }> = [];
      for (const p of prefixes) {
        const key = `vault-assets/${p}`;
        if (this.storage.delete(key)) {
          deleted.push({ name: p });
        }
      }
      this.sendJson(res, 200, deleted);
      return;
    }

    // Delete single: DELETE /object/vault-assets/<objectPath>
    if (method === 'DELETE' && path.startsWith('/object/vault-assets/')) {
      if (caller.role !== 'authenticated' && caller.role !== 'service_role') {
        this.sendJson(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'Authentication required' });
        return;
      }
      const objectPath = decodeURIComponent(path.slice('/object/vault-assets/'.length));
      this.storage.delete(`vault-assets/${objectPath}`);
      this.sendJson(res, 200, { message: 'Successfully deleted' });
      return;
    }

    // List: POST /object/list/vault-assets
    if (method === 'POST' && path === '/object/list/vault-assets') {
      const body = (await this.readJsonBody(req)) as { prefix?: string };
      const prefix = typeof body.prefix === 'string' ? body.prefix : '';
      const items = [...this.storage.values()]
        .filter((o) => o.path.startsWith(prefix))
        .map((o) => ({
          name: o.path.slice(prefix.length).replace(/^\/+/, ''),
          id: crypto.randomUUID(),
          updated_at: o.updatedAt,
          created_at: o.createdAt,
          metadata: { mimetype: o.contentType, size: o.data.length },
        }));
      this.sendJson(res, 200, items);
      return;
    }

    this.sendJson(res, 404, { statusCode: '404', error: 'not_found', message: `Unsupported storage path ${path}` });
  }

  private extractMultipartFile(
    raw: Buffer,
    contentTypeHeader: string,
  ): { data: Buffer; contentType: string } | null {
    const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentTypeHeader);
    if (!m) return null;
    const boundary = m[1] || m[2];
    const boundaryBuf = Buffer.from(`--${boundary}`);
    const crlfcrlf = Buffer.from('\r\n\r\n');

    let pos = raw.indexOf(boundaryBuf);
    while (pos !== -1) {
      const partStart = pos + boundaryBuf.length;
      if (raw.subarray(partStart, partStart + 2).equals(Buffer.from('--'))) {
        break;
      }
      const headerStart = raw.subarray(partStart, partStart + 2).equals(Buffer.from('\r\n'))
        ? partStart + 2
        : partStart;
      const headerEnd = raw.indexOf(crlfcrlf, headerStart);
      if (headerEnd === -1) break;

      const headersStr = raw.subarray(headerStart, headerEnd).toString('utf8');
      const bodyStart = headerEnd + 4;
      const nextBoundary = raw.indexOf(boundaryBuf, bodyStart);
      if (nextBoundary === -1) break;
      const bodyEnd = raw.subarray(nextBoundary - 2, nextBoundary).equals(Buffer.from('\r\n'))
        ? nextBoundary - 2
        : nextBoundary;

      if (headersStr.includes('filename=') || !headersStr.includes('name="cacheControl"')) {
        const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headersStr);
        if (headersStr.includes('filename=') || ctMatch) {
          return {
            data: Buffer.from(raw.subarray(bodyStart, bodyEnd)),
            contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
          };
        }
      }
      pos = nextBoundary;
    }
    return null;
  }

  // =========================================================================
  // Realtime WebSocket (/realtime/v1/websocket)
  // =========================================================================
  private handleWsConnection(ws: WebSocket, reqUrl: URL, req: http.IncomingMessage): void {
    const vsnParam = reqUrl.searchParams.get('vsn');
    const vsn: '1.0.0' | '2.0.0' = vsnParam === '1.0.0' ? '1.0.0' : '2.0.0';
    const caller = this.resolveCaller(req);

    const client: ClientSocketState = {
      ws,
      vsn,
      userId: caller.userId,
      role: caller.role,
      channels: new Map(),
    };
    this.wsClients.add(client);

    ws.on('message', (data, isBinary) => {
      try {
        this.handleWsMessage(client, data, isBinary);
      } catch {
        // ignore malformed frames
      }
    });

    ws.on('close', () => {
      this.wsClients.delete(client);
    });
  }

  private decodeWsFrame(
    vsn: '1.0.0' | '2.0.0',
    data: WebSocket.RawData,
    isBinary: boolean,
  ): { join_ref: string | null; ref: string | null; topic: string; event: string; payload: Record<string, unknown> } | null {
    if (isBinary) {
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer);
      if (buf.length < 7 || buf.readUInt8(0) !== 3) return null; // kind=3 userBroadcastPush
      const joinRefLen = buf.readUInt8(1);
      const refLen = buf.readUInt8(2);
      const topicLen = buf.readUInt8(3);
      const userEventLen = buf.readUInt8(4);
      const metaLen = buf.readUInt8(5);
      const encodingType = buf.readUInt8(6);
      let offset = 7;
      const joinRef = buf.subarray(offset, offset + joinRefLen).toString('utf8') || null;
      offset += joinRefLen;
      const ref = buf.subarray(offset, offset + refLen).toString('utf8') || null;
      offset += refLen;
      const topic = buf.subarray(offset, offset + topicLen).toString('utf8');
      offset += topicLen;
      const userEvent = buf.subarray(offset, offset + userEventLen).toString('utf8');
      offset += userEventLen;
      offset += metaLen;
      const payloadBuf = buf.subarray(offset);
      const parsedPayload =
        encodingType === 1 ? (JSON.parse(payloadBuf.toString('utf8')) as unknown) : payloadBuf;
      return {
        join_ref: joinRef,
        ref,
        topic,
        event: 'broadcast',
        payload: {
          type: 'broadcast',
          event: userEvent,
          payload: parsedPayload,
        },
      };
    }

    const str = typeof data === 'string' ? data : data.toString();
    const parsed = JSON.parse(str) as unknown;
    if (Array.isArray(parsed) && parsed.length >= 5) {
      return {
        join_ref: (parsed[0] as string | null) ?? null,
        ref: (parsed[1] as string | null) ?? null,
        topic: String(parsed[2] ?? ''),
        event: String(parsed[3] ?? ''),
        payload: (parsed[4] as Record<string, unknown>) ?? {},
      };
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      return {
        join_ref: (obj.join_ref as string | null) ?? null,
        ref: (obj.ref as string | null) ?? null,
        topic: String(obj.topic ?? ''),
        event: String(obj.event ?? ''),
        payload: (obj.payload as Record<string, unknown>) ?? {},
      };
    }
    void vsn;
    return null;
  }

  private sendWsFrame(
    client: ClientSocketState,
    frame: { join_ref: string | null; ref: string | null; topic: string; event: string; payload: unknown },
  ): void {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    if (client.vsn === '2.0.0') {
      client.ws.send(JSON.stringify([frame.join_ref, frame.ref, frame.topic, frame.event, frame.payload]));
    } else {
      client.ws.send(
        JSON.stringify({
          join_ref: frame.join_ref,
          ref: frame.ref,
          topic: frame.topic,
          event: frame.event,
          payload: frame.payload,
        }),
      );
    }
  }

  private handleWsMessage(client: ClientSocketState, data: WebSocket.RawData, isBinary: boolean): void {
    const msg = this.decodeWsFrame(client.vsn, data, isBinary);
    if (!msg) return;

    if (msg.event === 'heartbeat' && msg.topic === 'phoenix') {
      this.sendWsFrame(client, {
        join_ref: msg.join_ref,
        ref: msg.ref,
        topic: 'phoenix',
        event: 'phx_reply',
        payload: { status: 'ok', response: {} },
      });
      return;
    }

    if (msg.event === 'access_token') {
      const token = typeof msg.payload.access_token === 'string' ? msg.payload.access_token : '';
      const jwt = token ? this.verifyJwt(token) : null;
      if (jwt && jwt.role === 'authenticated' && typeof jwt.sub === 'string') {
        client.userId = jwt.sub;
        client.role = 'authenticated';
      } else if (jwt && jwt.role === 'service_role') {
        client.userId = null;
        client.role = 'service_role';
      }
      const ch = client.channels.get(msg.topic);
      if (ch) {
        ch.userId = client.userId;
        ch.role = client.role;
      }
      return;
    }

    if (msg.event === 'phx_join') {
      const accessToken = typeof msg.payload.access_token === 'string' ? msg.payload.access_token : '';
      if (accessToken) {
        const jwt = this.verifyJwt(accessToken);
        if (jwt && jwt.role === 'authenticated' && typeof jwt.sub === 'string') {
          client.userId = jwt.sub;
          client.role = 'authenticated';
        } else if (jwt && jwt.role === 'service_role') {
          client.userId = null;
          client.role = 'service_role';
        }
      }

      const config = (msg.payload.config as Record<string, unknown> | undefined) ?? {};
      const broadcastCfg = (config.broadcast as Record<string, unknown> | undefined) ?? {};
      const pgFilters = Array.isArray(config.postgres_changes)
        ? (config.postgres_changes as Array<Record<string, unknown>>)
        : [];

      const assignedSubs: PostgresSubBinding[] = pgFilters.map((f) => {
        const binding: PostgresSubBinding = {
          id: this.nextPgSubId++,
          event: typeof f.event === 'string' ? f.event : '*',
        };
        if (typeof f.schema === 'string') binding.schema = f.schema;
        if (typeof f.table === 'string') binding.table = f.table;
        if (typeof f.filter === 'string') binding.filter = f.filter;
        return binding;
      });

      const joined: JoinedChannel = {
        topic: msg.topic,
        vsn: client.vsn,
        broadcastAck: broadcastCfg.ack === true,
        broadcastSelf: broadcastCfg.self === true,
        userId: client.userId,
        role: client.role,
        postgresChanges: assignedSubs,
      };
      client.channels.set(msg.topic, joined);

      this.sendWsFrame(client, {
        join_ref: msg.join_ref,
        ref: msg.ref,
        topic: msg.topic,
        event: 'phx_reply',
        payload: {
          status: 'ok',
          response: {
            postgres_changes: assignedSubs,
          },
        },
      });
      return;
    }

    if (msg.event === 'phx_leave') {
      client.channels.delete(msg.topic);
      this.sendWsFrame(client, {
        join_ref: msg.join_ref,
        ref: msg.ref,
        topic: msg.topic,
        event: 'phx_reply',
        payload: { status: 'ok', response: {} },
      });
      return;
    }

    if (msg.event === 'broadcast') {
      const senderChannel = client.channels.get(msg.topic);
      for (const peer of this.wsClients) {
        const peerChannel = peer.channels.get(msg.topic);
        if (!peerChannel) continue;
        if (peer === client && !senderChannel?.broadcastSelf) continue;
        this.sendWsFrame(peer, {
          join_ref: null,
          ref: null,
          topic: msg.topic,
          event: 'broadcast',
          payload: {
            type: 'broadcast',
            event: msg.payload.event,
            payload: msg.payload.payload,
          },
        });
      }
      if (senderChannel?.broadcastAck && msg.ref) {
        this.sendWsFrame(client, {
          join_ref: msg.join_ref,
          ref: msg.ref,
          topic: msg.topic,
          event: 'phx_reply',
          payload: { status: 'ok', response: {} },
        });
      }
    }
  }

  private emitPostgresChange(
    op: 'INSERT' | 'UPDATE' | 'DELETE',
    table: string,
    newRow: Row | null,
    oldRow: Row | null,
  ): void {
    const targetRow = newRow ?? oldRow;
    if (!targetRow) return;
    const commitTimestamp = nowIso();

    for (const client of this.wsClients) {
      const caller: CallerContext = {
        role: client.role,
        userId: client.userId,
      };

      // RLS check per client socket
      if (!this.canSelectRow(table, targetRow, caller)) {
        continue;
      }

      const sanitizedNew = newRow ? this.sanitizeRowForCaller(table, newRow, caller) : {};
      const sanitizedOld = oldRow ? this.sanitizeRowForCaller(table, oldRow, caller) : {};
      const columns = Object.keys(newRow ?? oldRow ?? {}).map((name) => ({
        name,
        type: typeof (newRow ?? oldRow)?.[name] === 'boolean'
          ? 'bool'
          : typeof (newRow ?? oldRow)?.[name] === 'number'
            ? 'float8'
            : 'text',
      }));

      for (const channel of client.channels.values()) {
        const matchingIds: number[] = [];
        for (const sub of channel.postgresChanges) {
          if (sub.schema && sub.schema !== '*' && sub.schema !== 'public') continue;
          if (sub.table && sub.table !== '*' && sub.table !== table) continue;
          if (sub.event !== '*' && sub.event.toUpperCase() !== op) continue;
          if (sub.filter) {
            const eqIdx = sub.filter.indexOf('=');
            if (eqIdx !== -1) {
              const col = sub.filter.slice(0, eqIdx);
              const filterVal = sub.filter.slice(eqIdx + 1);
              const pred = this.buildColumnPredicate(col, filterVal);
              if (!pred(targetRow)) continue;
            }
          }
          matchingIds.push(sub.id);
        }

        if (matchingIds.length > 0) {
          this.sendWsFrame(client, {
            join_ref: null,
            ref: null,
            topic: channel.topic,
            event: 'postgres_changes',
            payload: {
              ids: matchingIds,
              data: {
                schema: 'public',
                table,
                commit_timestamp: commitTimestamp,
                type: op,
                columns,
                record: sanitizedNew,
                old_record: sanitizedOld,
                errors: null,
              },
            },
          });
        }
      }
    }
  }
}

export async function startSupabaseProtocolServer(port = 0): Promise<{
  server: SupabaseProtocolServer;
  info: ProtocolServerInfo;
}> {
  const server = new SupabaseProtocolServer();
  const info = await server.start(port);
  return { server, info };
}
