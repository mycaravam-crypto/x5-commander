import { defineConfig, type Plugin } from 'vite';
import { openScores } from './server/scores.ts';
import { scoresApi } from './server/api.ts';

// The game's API (/api: scoreboard and accounts, server/api.ts) on the dev and preview servers, backed by a local SQLite file.
// X5_SCORES_DB moves the file; the default is data/scores.db.
function scoreboard(): Plugin {
  let api: ReturnType<typeof scoresApi> | undefined;
  const get = () => api ??= scoresApi(openScores(process.env.X5_SCORES_DB ?? 'data/scores.db'));
  return {
    name: 'x5-scoreboard',
    configureServer: server => { server.middlewares.use((req, res, next) => get()(req, res, next)); },
    configurePreviewServer: server => { server.middlewares.use((req, res, next) => get()(req, res, next)); },
  };
}

export default defineConfig({ plugins: [scoreboard()] });
