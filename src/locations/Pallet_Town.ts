/// <reference types="@workadventure/iframe-api-typings" />


export function register(): void {
    WA.room.area.onEnter('oaks-lab-entrance').subscribe(() => onEnterOaksLab());
}

function onEnterOaksLab(): void {
    // TODO: trigger starter selection or Oak dialogue when the player enters
    console.info('[Pallet Town] Entered Oak\'s Lab');
}
