/// <reference types="@workadventure/iframe-api-typings" />

import {
    updateProgress,
    getProgress,
    getParty,
    getInventory,
    getBadges,
    healParty,
    type InventoryItem,
} from '../api';
import { initMap, handleApiError } from '../main';
import { register as registerPalletTown } from '../locations/Pallet_Town';
import { register as registerRoute1 } from '../locations/Route_1';
import { register as registerViridianCity } from '../locations/Viridian_City';

console.log('%c[Kanto] kanto-region loaded', 'color: lime; font-weight: bold');

// ─── Zone → human-readable location label ─────────────────────────────────────

const ZONES: Record<string, string> = {
    'zone-pallet-town':   'Pallet Town',
    'zone-route-1':       'Route 1',
    'zone-viridian-city': 'Viridian City',
};

// ─── Entry point ─────────────────────────────────────────────────────────────

initMap(async (_user, _progress) => {

    // Location-specific triggers
    registerPalletTown();
    registerRoute1();
    registerViridianCity();

    // Location zone tracking — update current_location when entering each zone
    for (const [area, label] of Object.entries(ZONES)) {
        WA.room.area.onEnter(area).subscribe(async () => {
            try {
                await updateProgress({ current_map: WA.room.id ?? area, current_location: label });
                console.info(`[Location] ${label}`);
            } catch (e) {
                console.warn('[Location] Failed to update location:', e);
            }
        });
    }

    // Shared area interactions
    WA.room.area.onEnter('pokecenter-counter').subscribe(() => onEnterPokemonCenter());
    WA.room.area.onEnter('bag').subscribe(() => onOpenBag());
    WA.room.area.onEnter('badge-display').subscribe(() => onViewBadges());

});

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

        if (fainted.length === 0 && injured.length === 0) {
            popup = WA.ui.openPopup('healPopup', 'Your Pokémon are already in perfect health! ❤️', [
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
                { label: 'No thanks', callback: () => popup?.close() },
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

        popup = WA.ui.openPopup(
            'badgePopup',
            `🏅 Kanto Badges (${earned.length}/8)\n\n${[...earned, ...missing].join('\n')}`,
            [{ label: 'Close', callback: () => popup?.close() }]
        );
    } catch (e) {
        handleApiError('Badges', e);
    }
}

export {};
