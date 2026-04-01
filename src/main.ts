/// <reference types="@workadventure/iframe-api-typings" />

import { bootstrapExtra } from "@workadventure/scripting-api-extra";
import { initSession, getProgress, ApiError } from "./api";
import type { PlayerUser, PlayerProgress } from "./api";

// ─── Core init ────────────────────────────────────────────────────────────────
//
// Call initMap() from each map script. It handles session init, onboarding
// check, and bootstrapExtra, then invokes the map-specific callback.

export async function initMap(
    onReady: (user: PlayerUser, progress: PlayerProgress) => Promise<void>
): Promise<void> {
    WA.onInit().then(async () => {
        bootstrapExtra().catch(e => console.error('[bootstrapExtra]', e));

        try {
            const user = await initSession();
            console.info(`[API] Authenticated as "${user.name}" (id=${user.id})`);

            const progress = await getProgress();

            if (!progress.flags?.intro_complete) {
                WA.ui.modal.openModal({
                    src: `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1'}/onboarding`,
                    title: 'Welcome to Kanto',
                    allowApi: true,
                    position: 'center',
                    allow: null,
                    allowFullScreen: false,
                });
            }

            await onReady(user, progress);
        } catch (e) {
            console.error('[API] Failed to initialize:', e);
        }
    }).catch(e => console.error(e));
}

// ─── Shared error handling ────────────────────────────────────────────────────

export function handleApiError(context: string, e: unknown): void {
    if (e instanceof ApiError) {
        console.error(`[API] ${context} error (${e.status}):`, e.message);
        if (e.status === 401) {
            WA.ui.openPopup('errorPopup', 'Session expired. Please refresh the page.', []);
        }
    } else {
        console.error(`[API] ${context} unexpected error:`, e);
    }
}
