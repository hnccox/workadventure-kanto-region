/// <reference types="@workadventure/iframe-api-typings" />

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlayerUser {
    id: number;
    uuid: string;
    name: string;
    trainer_class: string | null;
}

export interface PlayerProgress {
    id: number;
    user_id: number;
    pokedollars: number;
    current_map: string | null;
    current_location: string | null;
    starter_chosen: boolean;
    rival_name: string | null;
    total_play_seconds: number;
    flags: Record<string, unknown> | null;
}

export interface ItemDefinition {
    id: number;
    slug: string;
    name: string;
    type: 'pokeball' | 'medicine' | 'badge' | 'key_item' | 'tm' | 'berry' | 'misc';
    description: string | null;
    buy_price: number | null;
    sell_price: number | null;
    max_quantity: number | null;
    sprite_key: string | null;
}

export interface InventoryItem {
    id: number;
    quantity: number;
    acquired_at: string | null;
    definition: ItemDefinition;
}

export interface PokemonDefinition {
    id: number;
    pokedex_number: number;
    slug: string;
    name: string;
    type_primary: string;
    type_secondary: string | null;
    base_hp: number;
    base_attack: number;
    base_defense: number;
    base_speed: number;
    sprite_key: string | null;
}

export interface PlayerPokemon {
    id: number;
    nickname: string | null;
    level: number;
    current_hp: number;
    max_hp: number;
    is_fainted: boolean;
    is_in_party: boolean;
    party_slot: number | null;
    caught_at_map: string | null;
    definition: PokemonDefinition;
}

// ─── Token storage ───────────────────────────────────────────────────────────

const TOKEN_STATE_KEY = 'apiToken';

function getStoredToken(): string | null {
    try {
        return (WA.player.state[TOKEN_STATE_KEY] as string) ?? null;
    } catch {
        return null;
    }
}

function storeToken(token: string): void {
    WA.player.state[TOKEN_STATE_KEY] = token;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    authenticated = true
): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    if (authenticated) {
        const token = getStoredToken();
        if (!token) throw new Error('Not authenticated. Call initSession() first.');
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new ApiError(response.status, error?.message ?? 'Unknown error', error);
    }

    return response.json() as Promise<T>;
}

const get  = <T>(path: string, auth = true)               => request<T>('GET',   path, undefined, auth);
const post = <T>(path: string, body: unknown, auth = true) => request<T>('POST',  path, body, auth);
const patch= <T>(path: string, body: unknown)              => request<T>('PATCH', path, body);

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly body?: unknown
    ) {
        super(message);
    }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

let _currentUser: PlayerUser | null = null;

/**
 * Must be called once inside WA.onInit().
 * Finds or creates the player's account using WA.player.uuid,
 * stores the token in WA.player.state so it survives room transitions.
 */
export async function initSession(): Promise<PlayerUser> {
    const existingToken = getStoredToken();

    if (existingToken) {
        try {
            const { progress, ...user } = await get<PlayerUser & { progress: PlayerProgress }>('/auth/me');
            _currentUser = user;
            return user;
        } catch (e) {
            // Token expired or invalid — fall through and get a new one
            WA.player.state[TOKEN_STATE_KEY] = null;
        }
    }

    const data = await post<{ token: string; user: PlayerUser }>('/auth/session', {
        uuid: WA.player.uuid,
        display_name: WA.player.name,
    }, false);

    storeToken(data.token);
    _currentUser = data.user;
    return data.user;
}

export function currentUser(): PlayerUser | null {
    return _currentUser;
}

export async function logout(): Promise<void> {
    await post('/auth/logout', {});
    WA.player.state[TOKEN_STATE_KEY] = null;
    _currentUser = null;
}

// ─── Player ──────────────────────────────────────────────────────────────────

export async function getProgress(): Promise<PlayerProgress> {
    return get<PlayerProgress>('/player/progress');
}

export async function updateProgress(data: Partial<{
    current_map: string;
    current_location: string;
    starter_chosen: boolean;
    rival_name: string;
    flags: Record<string, unknown>;
}>): Promise<PlayerProgress> {
    return patch<PlayerProgress>('/player/progress', data);
}

export async function addCurrency(amount: number): Promise<{ pokedollars: number }> {
    return post('/player/progress/add-currency', { amount });
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export async function getInventory(type?: string): Promise<InventoryItem[]> {
    const query = type ? `?type=${type}` : '';
    return get<InventoryItem[]>(`/inventory${query}`);
}

export async function getBadges(): Promise<InventoryItem[]> {
    return get<InventoryItem[]>('/inventory/badges');
}

export async function addItem(itemSlug: string, quantity: number): Promise<InventoryItem> {
    return post<InventoryItem>('/inventory/add', { item_slug: itemSlug, quantity });
}

export async function removeItem(itemSlug: string, quantity: number): Promise<InventoryItem> {
    return post<InventoryItem>('/inventory/remove', { item_slug: itemSlug, quantity });
}

// ─── Pokemon ─────────────────────────────────────────────────────────────────

export async function getParty(): Promise<PlayerPokemon[]> {
    return get<PlayerPokemon[]>('/pokemon/party');
}

export async function getBox(): Promise<PlayerPokemon[]> {
    return get<PlayerPokemon[]>('/pokemon/box');
}

export async function catchPokemon(
    pokemonSlug: string,
    level: number,
    caughtAtMap?: string
): Promise<PlayerPokemon> {
    return post<PlayerPokemon>('/pokemon/catch', {
        pokemon_slug: pokemonSlug,
        level,
        caught_at_map: caughtAtMap,
    });
}

export async function healParty(): Promise<void> {
    await post('/pokemon/heal-party', {});
}

// ─── Shop ────────────────────────────────────────────────────────────────────

export interface ShopItem extends ItemDefinition {}

export async function getShopCatalog(shopSlug: string): Promise<ShopItem[]> {
    return get<ShopItem[]>(`/shop/${shopSlug}`);
}

export async function buyItem(
    itemSlug: string,
    quantity: number,
    shopSlug?: string
): Promise<{ pokedollars: number }> {
    return post('/shop/buy', { item_slug: itemSlug, quantity, shop_slug: shopSlug });
}

export async function sellItem(
    itemSlug: string,
    quantity: number
): Promise<{ pokedollars: number }> {
    return post('/shop/sell', { item_slug: itemSlug, quantity });
}

// ─── Pokedex ─────────────────────────────────────────────────────────────────

export async function getPokedex(): Promise<PokemonDefinition[]> {
    return get<PokemonDefinition[]>('/pokedex', false);
}

export async function getPokemonBySlug(slug: string): Promise<PokemonDefinition> {
    return get<PokemonDefinition>(`/pokedex/${slug}`, false);
}
