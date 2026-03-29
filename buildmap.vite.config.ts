import 'dotenv/config';
import { defineConfig } from "vite";
import { getMaps, getMapsScripts } from "wa-map-optimizer-vite";

const maps = getMaps();

export default defineConfig({
    base: "./",
    build: {
        sourcemap: true,
        rollupOptions: {
            input: {
                ...getMapsScripts(maps),
            },
        },
    },
});
