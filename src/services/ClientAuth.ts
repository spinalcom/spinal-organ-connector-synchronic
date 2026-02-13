import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import type { BadgeRecord } from '../interfaces/api/Badge';
import type { AccessRecord } from '../interfaces/api/Access';
import type { EventRecord } from '../interfaces/api/Event';

type LoginResponse = {
  accessToken: string;
  authenticationType?: string;
  expirationDate?: string;
};

type QueryParams = Record<string, string | number | boolean | undefined>;

type PaginatedResponse<T> = {
  data: T[];
  links?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

type UserRecord = Record<string, unknown>;

type TokenCache = {
  accessToken: string;
  expirationDate?: string;
};

export class ClientApi {
  private static instance: ClientApi;
  private apiAxios: AxiosInstance;
  private authAxios: AxiosInstance;
  private authPromise?: Promise<string>;
  private bearerToken?: string;
  private tokenExpiresAt?: number;
  private readonly tokenRefreshSkewMs = 60 * 1000;
  private readonly tokenCachePath: string;

  private constructor() {
    const baseURL = process.env.CLIENT_BASE_URL;
    if (!baseURL) throw new Error('Missing CLIENT_BASE_URL environment variable');

    this.apiAxios = axios.create({ baseURL });
    this.authAxios = axios.create({ baseURL });
    this.tokenCachePath =
      process.env.CLIENT_TOKEN_CACHE_PATH ??
      path.resolve(process.cwd(), 'client-token.json');

    this.loadTokenFromCache();

    this.apiAxios.interceptors.request.use(async (config) => {
      const cfg = config;
      if (!cfg.headers) cfg.headers = {};
      const hasAuthHeader = Boolean(
        (cfg.headers as Record<string, string>).Authorization ||
        (cfg.headers as Record<string, string>).authorization
      );

      if (!hasAuthHeader) {
        const token = await this.ensureBearerToken();
        (cfg.headers as Record<string, string>).Authorization = `Bearer ${token}`;
      }

      return cfg;
    });
  }

  public static getInstance(): ClientApi {
    if (!ClientApi.instance) ClientApi.instance = new ClientApi();
    return ClientApi.instance;
  }

  private async ensureBearerToken(): Promise<string> {
    if (this.bearerToken && this.isTokenValid()) return this.bearerToken;
    if (!this.authPromise) this.authPromise = this.loginWithPassword();
    this.bearerToken = await this.authPromise;
    return this.bearerToken;
  }

  private async loginWithPassword(): Promise<string> {
    const user = process.env.CLIENT_USER;
    const password = process.env.CLIENT_PASSWORD;
    if (!user) throw new Error('Missing CLIENT_USER environment variable');
    if (!password) throw new Error('Missing CLIENT_PASSWORD environment variable');

    const response = await this.authAxios.post<LoginResponse>(
      '/auth/login?type=password',
      {
        username: user,
        password,
      }
    );

    const data = response.data;
    const token = data.accessToken;
    if (!token) throw new Error('Missing bearer token in auth response');

    console.log('Successfully authenticated with client API');
    console.log(`Token expires at: ${data.expirationDate || 'unknown'}`);

    const expirationDate = data.expirationDate;
    this.tokenExpiresAt = expirationDate ? Date.parse(expirationDate) : undefined;
    this.authPromise = undefined;

    this.apiAxios.defaults.headers.common.Authorization = `Bearer ${token}`;
    this.saveTokenToCache({ accessToken: token, expirationDate });
    return token;
  }

  private isTokenValid(): boolean {
    if (!this.bearerToken) return false;
    if (!this.tokenExpiresAt) return true;
    return Date.now() + this.tokenRefreshSkewMs < this.tokenExpiresAt;
  }

  private loadTokenFromCache(): void {
    try {
      if (!fs.existsSync(this.tokenCachePath)) return;
      const raw = fs.readFileSync(this.tokenCachePath, 'utf8');
      const cached = JSON.parse(raw) as TokenCache;
      if (!cached?.accessToken) return;

      const expiresAt = cached.expirationDate
        ? Date.parse(cached.expirationDate)
        : undefined;
      this.bearerToken = cached.accessToken;
      this.tokenExpiresAt = expiresAt;

      if (this.isTokenValid()) {
        this.apiAxios.defaults.headers.common.Authorization = `Bearer ${cached.accessToken}`;
        console.log('Loaded bearer token from cache');
      } else {
        this.bearerToken = undefined;
        this.tokenExpiresAt = undefined;
      }
    } catch {
      // Ignore cache errors and continue with login flow.
    }
  }

  private saveTokenToCache(cache: TokenCache): void {
    try {
      const dir = path.dirname(this.tokenCachePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.tokenCachePath, JSON.stringify(cache), 'utf8');
    } catch {
      // Ignore cache write errors.
    }
  }

  public get client(): AxiosInstance {
    return this.apiAxios;
  }

  // ---- API methods ----
  public async getEvents(
    params: QueryParams = {}
  ): Promise<PaginatedResponse<EventRecord>> {
    const response = await this.apiAxios.get<PaginatedResponse<EventRecord>>(
      '/events',
      { params }
    );
    return response.data;
  }

  public async getUsers(
    params: QueryParams = {}
  ): Promise<PaginatedResponse<UserRecord>> {
    const response = await this.apiAxios.get<PaginatedResponse<UserRecord>>(
      '/users',
      { params }
    );
    return response.data;
  }

  public async getAccesses(
    params: QueryParams = {}
  ): Promise<PaginatedResponse<AccessRecord>> {
    const mergedParams = {
      include: 'controlUnit',
      ...params,
    };
    const response = await this.apiAxios.get<PaginatedResponse<AccessRecord>>(
      '/accesses',
      { params: mergedParams }
    );
    return response.data;
  }

  public async getBadges(
    params: QueryParams = {}
  ): Promise<PaginatedResponse<BadgeRecord>> {
    const mergedParams = {
      include: 'identifier,user',
      ...params,
    };
    const response = await this.apiAxios.get<PaginatedResponse<BadgeRecord>>(
      '/badges',
      { params: mergedParams }
    );
    return response.data;
  }

  public async getAllPages<T>(
    path: string,
    params: QueryParams = {}
  ): Promise<T[]> {
    const perPage =
      typeof params.paginate === 'number' ? params.paginate : 100;
    let page = typeof params.page === 'number' ? params.page : 1;
    let hasNext = true;
    const all: T[] = [];

    while (hasNext) {
      const response = await this.apiAxios.get<PaginatedResponse<T>>(path, {
        params: {
          ...params,
          page,
          paginate: perPage,
        },
      });

      const data = response.data?.data ?? [];
      all.push(...data);

      const meta = response.data?.meta as
        | { current_page?: number; last_page?: number }
        | undefined;

      if (meta?.current_page && meta?.last_page) {
        hasNext = meta.current_page < meta.last_page;
        page = meta.current_page + 1;
      } else if (data.length < perPage) {
        hasNext = false;
      } else {
        page += 1;
      }
    }

    return all;
  }



  public async getAllEvents(
    params: QueryParams = {}
  ): Promise<EventRecord[]> {
    return this.getAllPages<EventRecord>('/events', params);
  }

  public async getAllUsers(
    params: QueryParams = {}
  ): Promise<UserRecord[]> {
    return this.getAllPages<UserRecord>('/users', params);
  }

  public async getAllAccesses(
    params: QueryParams = {}
  ): Promise<AccessRecord[]> {
    const mergedParams = {
      include: 'controlUnit',
      ...params,
    };
    return this.getAllPages<AccessRecord>('/accesses', mergedParams);
  }

  public async getAllBadges(
    params: QueryParams = {}
  ): Promise<BadgeRecord[]> {
    const mergedParams = {
      include: 'identifier,user',
      ...params,
    };
    return this.getAllPages<BadgeRecord>('/badges', mergedParams);
  }
}
