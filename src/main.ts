/// <reference types="@workadventure/iframe-api-typings" />

import { bootstrapExtra } from "@workadventure/scripting-api-extra";
import {
    initSession,
    getProgress,
    updateProgress,
    getInventory,
    getBadges,
    healParty,
    getShopCatalog,
    getParty,
    ApiError,
    type InventoryItem,
    type ShopItem,
} from "./api";

console.info('Script started successfully');

// ─── Init ─────────────────────────────────────────────────────────────────────

WA.onInit().then(async () => {
    console.info('Scripting API ready');

    bootstrapExtra().then(() => {
        console.info('Scripting API Extra ready');
    }).catch(e => console.error(e));

    // Authenticate with the API and load player state
    try {
        const user = await initSession();
        console.info(`[API] Authenticated as "${user.name}" (id=${user.id})`);

        const progress = await getProgress();
        console.info(`[API] PokéDollars: ${progress.pokedollars} | Location: ${progress.current_location ?? 'Unknown'}`);

        // Update location whenever the player changes room
        await syncLocation();

    } catch (e) {
        console.error('[API] Failed to initialize session:', e);
    }

    // ─── Area hooks ─────────────────────────────────────────────────────────

    // Pokemart counter interaction
    WA.room.area.onEnter('pokemart-counter').subscribe(async () => {
        await onEnterPokemart();
    });

    // Pokemon Center counter interaction
    WA.room.area.onEnter('pokecenter-counter').subscribe(async () => {
        await onEnterPokemonCenter();
    });

    // Show inventory on entering the bag area
    WA.room.area.onEnter('bag').subscribe(async () => {
        await onOpenBag();
    });

    // Show badges on entering the badge display area
    WA.room.area.onEnter('badge-display').subscribe(async () => {
        await onViewBadges();
    });

}).catch(e => console.error(e));

// ─── Location sync ────────────────────────────────────────────────────────────

async function syncLocation(): Promise<void> {
    try {
        const mapUrl = WA.room.id ?? 'unknown';
        // Derive a human-readable location from the map URL
        const location = mapUrl.includes('pokemart') ? 'Poké Mart'
            : mapUrl.includes('pokecenter') ? 'Pokémon Center'
            : mapUrl.includes('kanto-region') ? 'Kanto'
            : mapUrl;

        await updateProgress({ current_map: mapUrl, current_location: location });
    } catch (e) {
        console.warn('[API] Could not sync location:', e);
    }
}

// ─── Pokemart ─────────────────────────────────────────────────────────────────

async function onEnterPokemart(): Promise<void> {
    try {
        const [catalog, progress] = await Promise.all([
            getShopCatalog('pokemart-viridian'),
            getProgress(),
        ]);

        if (catalog.length === 0) {
            WA.ui.openPopup('shopPopup', "Sorry, we're out of stock!", [{ label: 'Leave', callback: () => {} }]);
            return;
        }

        const itemList = catalog
            .slice(0, 6) // Show first 6 items to keep popup manageable
            .map((item: ShopItem) => `• ${item.name} — ₽${item.buy_price}`)
            .join('\n');

        WA.ui.openPopup(
            'shopPopup',
            `Welcome to the Poké Mart!\n\nYour balance: ₽${progress.pokedollars}\n\n${itemList}\n\n(Use /buy <item> in chat to purchase)`,
            [{ label: 'Leave', callback: () => {} }]
        );

    } catch (e) {
        handleApiError('Pokemart', e);
    }
}

// ─── Pokemon Center ───────────────────────────────────────────────────────────

async function onEnterPokemonCenter(): Promise<void> {
    let popup: any;

    try {
        const party = await getParty();

        if (party.length === 0) {
            popup = WA.ui.openPopup('healPopup', "You don't have any Pokémon with you!", [
                { label: 'OK', callback: () => popup?.close() },
            ]);
            return;
        }

        const fainted = party.filter(p => p.is_fainted);
        const injured = party.filter(p => !p.is_fainted && p.current_hp < p.max_hp);
        const needsHeal = fainted.length > 0 || injured.length > 0;

        if (!needsHeal) {
            popup = WA.ui.openPopup('healPopup', "Your Pokémon are already in perfect health! ❤️", [
                { label: 'OK', callback: () => popup?.close() },
            ]);
            return;
        }

        popup = WA.ui.openPopup(
            'healPopup',
            `Nurse Joy: "Shall I heal your Pokémon?\n\n${fainted.length} fainted, ${injured.length} injured."`,
            [
                {
                    label: 'Yes please!',
                    callback: async () => {
                        popup?.close();
                        await healParty();
                        const healed = WA.ui.openPopup('healedPopup', 'Your Pokémon have been restored to full health! ✨', [
                            { label: 'Thank you!', callback: () => healed?.close() },
                        ]);
                    },
                },
                {
                    label: 'No thanks',
                    callback: () => popup?.close(),
                },
            ]
        );

    } catch (e) {
        handleApiError('Pokemon Center', e);
    }
}

// ─── Bag ──────────────────────────────────────────────────────────────────────

async function onOpenBag(): Promise<void> {
    let popup: any;

    try {
        const [progress, inventory] = await Promise.all([getProgress(), getInventory()]);

        if (inventory.length === 0) {
            popup = WA.ui.openPopup('bagPopup', `Bag is empty.\nBalance: ₽${progress.pokedollars}`, [
                { label: 'Close', callback: () => popup?.close() },
            ]);
            return;
        }

        const itemLines = inventory
            .map((item: InventoryItem) => `• ${item.definition.name} ×${item.quantity}`)
            .join('\n');

        popup = WA.ui.openPopup(
            'bagPopup',
            `🎒 Bag\n\n${itemLines}\n\n₽${progress.pokedollars}`,
            [{ label: 'Close', callback: () => popup?.close() }]
        );

    } catch (e) {
        handleApiError('Bag', e);
    }
}

// ─── Badge display ────────────────────────────────────────────────────────────

async function onViewBadges(): Promise<void> {
    let popup: any;

    try {
        const badges = await getBadges();

        const badgeNames: Record<string, string> = {
            'badge-boulder': 'Boulder Badge',
            'badge-cascade': 'Cascade Badge',
            'badge-thunder': 'Thunder Badge',
            'badge-rainbow': 'Rainbow Badge',
            'badge-soul':    'Soul Badge',
            'badge-marsh':   'Marsh Badge',
            'badge-volcano': 'Volcano Badge',
            'badge-earth':   'Earth Badge',
        };

        const earned = badges.map(b => `✅ ${b.definition.name}`);
        const missing = Object.values(badgeNames)
            .filter(name => !badges.some(b => b.definition.name === name))
            .map(name => `⬜ ${name}`);

        const all = [...earned, ...missing].join('\n');
        popup = WA.ui.openPopup(
            'badgePopup',
            `🏅 Kanto Badges (${earned.length}/8)\n\n${all}`,
            [{ label: 'Close', callback: () => popup?.close() }]
        );

    } catch (e) {
        handleApiError('Badges', e);
    }
}

// ─── Error handling ───────────────────────────────────────────────────────────

function handleApiError(context: string, e: unknown): void {
    if (e instanceof ApiError) {
        console.error(`[API] ${context} error (${e.status}):`, e.message);
        if (e.status === 401) {
            WA.ui.openPopup('errorPopup', 'Session expired. Please refresh the page.', []);
        }
    } else {
        console.error(`[API] ${context} unexpected error:`, e);
    }
}

export {};
