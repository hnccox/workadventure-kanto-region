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
    chooseStarter,
    ApiError,
    type InventoryItem,
    type ShopItem,
} from "./api";

console.log('%c[Kanto] main.ts loaded ✓', 'color: lime; font-size: 16px; font-weight: bold');

// ─── Init ─────────────────────────────────────────────────────────────────────

WA.onInit().then(async () => {
    console.info('Scripting API ready');

    bootstrapExtra().then(() => {
        console.info('Scripting API Extra ready');
    }).catch(e => console.error(e));

    // Authenticate with the API and load player state
    let starterChosen = false;
    try {
        const user = await initSession();
        console.info(`[API] Authenticated as "${user.name}" (id=${user.id})`);

        const progress = await getProgress();
        console.info(`[API] PokéDollars: ${progress.pokedollars} | Location: ${progress.current_location ?? 'Unknown'}`);

        await syncLocation();
        starterChosen = progress.starter_chosen;

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

    // First-time player: run onboarding (always show if API unavailable)
    // Must be after area hooks so subscriptions are registered even during onboarding
    if (!starterChosen) {
        console.info('[Onboarding] starter_chosen=false, starting onboarding...');
        runOnboarding().catch(e => console.error('[Onboarding] error:', e));
    }

}).catch(e => console.error(e));

// ─── Onboarding (new player flow) ────────────────────────────────────────────

const STARTERS = [
    { slug: 'bulbasaur',  name: 'Bulbasaur',  type: 'Grass/Poison' },
    { slug: 'charmander', name: 'Charmander', type: 'Fire' },
    { slug: 'squirtle',   name: 'Squirtle',   type: 'Water' },
] as const;

type StarterSlug = typeof STARTERS[number]['slug'];

async function runOnboarding(): Promise<void> {
    // Step 1: Welcome
    await new Promise<void>(resolve => {
        const popup = WA.ui.openPopup(
            'onboardingWelcome',
            `Welcome to Kanto!\n\nProfessor Oak: "Ah, a new trainer! Before we begin, I need to know a little about you."`,
            [{ label: 'Continue', callback: () => { popup.close(); resolve(); } }]
        );
    });

    // Step 2: Choose trainer name (default = WA display name)
    const defaultName = WA.player.name ?? 'Trainer';
    let trainerName = defaultName;

    await new Promise<void>(resolve => {
        const popup = WA.ui.openPopup(
            'onboardingName',
            `Professor Oak: "What is your name, young trainer?\n\n(Your name will be set to: "${defaultName}"\nTo change it, update your WorkAdventure display name before entering.)"`,
            [
                {
                    label: `Continue as ${defaultName}`,
                    callback: () => { trainerName = defaultName; popup.close(); resolve(); },
                },
            ]
        );
    });

    // Step 3: Rival name
    let rivalName = 'Gary';

    await new Promise<void>(resolve => {
        const popup = WA.ui.openPopup(
            'onboardingRival',
            `Professor Oak: "And your rival — the boy next door — what was his name again?\n\nA) Gary\nB) Blue\nC) Red`,
            [
                { label: 'Gary',  callback: () => { rivalName = 'Gary';  popup.close(); resolve(); } },
                { label: 'Blue',  callback: () => { rivalName = 'Blue';  popup.close(); resolve(); } },
                { label: 'Red',   callback: () => { rivalName = 'Red';   popup.close(); resolve(); } },
            ]
        );
    });

    // Step 4: Choose starter
    let starterSlug: StarterSlug = 'charmander';

    const starterList = STARTERS.map(s => `${s.name} (${s.type})`).join('\n');

    await new Promise<void>(resolve => {
        const popup = WA.ui.openPopup(
            'onboardingStarter',
            `Professor Oak: "Now then — choose your first Pokémon!\n\n${starterList}`,
            [
                ...STARTERS.map(s => ({
                    label: s.name,
                    callback: () => {
                        starterSlug = s.slug;
                        popup.close();
                        resolve();
                    },
                })),
            ]
        );
    });

    // Step 5: Confirmation
    await new Promise<void>(resolve => {
        const chosenStarter = STARTERS.find(s => s.slug === starterSlug)!;
        const popup = WA.ui.openPopup(
            'onboardingConfirm',
            `Professor Oak: "So your name is ${trainerName}, your rival is ${rivalName}, and you've chosen ${chosenStarter.name}. Is that correct?"`,
            [
                {
                    label: 'Yes!',
                    callback: async () => {
                        popup.close();
                        try {
                            const result = await chooseStarter(trainerName, rivalName, starterSlug);
                            const done = WA.ui.openPopup(
                                'onboardingDone',
                                `Professor Oak: "Wonderful! ${result.starter.definition.name} is now your partner. Good luck on your journey, ${result.trainer_name}!\n\nYou received:\n• ${result.starter.definition.name} Lv.${result.starter.level}"`,
                                [{ label: "Let's go!", callback: () => { done.close(); resolve(); } }]
                            );
                        } catch (e) {
                            console.error('[API] Onboarding failed:', e);
                            resolve();
                        }
                    },
                },
                {
                    label: 'Go back',
                    callback: () => {
                        popup.close();
                        resolve();
                        // Re-run onboarding from scratch
                        runOnboarding().catch(console.error);
                    },
                },
            ]
        );
    });
}

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
