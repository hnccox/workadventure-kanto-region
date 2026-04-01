/// <reference types="@workadventure/iframe-api-typings" />

import { updateProgress, getProgress, getShopCatalog, type ShopItem } from '../api';
import { initMap, handleApiError } from '../main';

console.log('%c[Kanto] kanto-pokemart loaded', 'color: cyan; font-weight: bold');

const MAP_TILES_W = 14;
const MAP_TILES_H = 12;
const TILE_SIZE   = 16;

initMap(async (_user, _progress) => {

    // Center the map in the viewport without changing zoom
    WA.camera.set(
        (MAP_TILES_W * TILE_SIZE) / 2,
        (MAP_TILES_H * TILE_SIZE) / 2,
        window.innerWidth,
        window.innerHeight,
        false
    );

    // Entire map is one location — update on entry
    updateProgress({
        current_map:      WA.room.id ?? 'kanto-pokemart',
        current_location: 'Poké Mart (Viridian City)',
    }).catch(e => console.warn('[Location] Failed to update location:', e));

    WA.room.area.onEnter('pokemart-counter').subscribe(() => onEnterPokemart());

});

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
            .slice(0, 6)
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

export {};
