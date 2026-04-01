/// <reference types="@workadventure/iframe-api-typings" />

import { updateProgress, getProgress, getShopCatalog, type ShopItem } from '../api';
import { initMap, handleApiError } from '../main';

console.log('%c[Kanto] kanto-pokemart loaded', 'color: cyan; font-weight: bold');

initMap(async (_user, _progress) => {

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
