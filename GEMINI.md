# Ghost Viewer

## Project Overview

**Ghost Viewer** is a specialized tool designed to visualize and "hunt" for orphaned resources within an [SST (Serverless Stack)](https://sst.dev/) project. It provides a web interface to explore your local SST state file and compares it against live AWS resources to identify items that may have been left behind after deployments or removals.

**Key Features:**
*   **State Explorer:** Visualize your `state.json` in a searchable tree or list view.
*   **Ghost Hunter:** Scan your AWS account for resources tagged with your SST app/stage and identify unmanaged orphans.
*   **CLI First:** Designed to be run directly in your project root via `npx`.

**Tech Stack:**
*   **Frontend:** React (Vite), Tailwind CSS, Lucide React.
*   **Backend:** Node.js (Express), AWS SDK.
*   **CLI Build:** `tsup` for the backend, `vite` for the frontend.

## Architecture

1.  **Server (`server/index.ts` & `server/cli.ts`):**
    *   The backend is an Express app that serves an API and the static UI files.
    *   **Port Selection:** Automatically finds the next available port starting from 3001.
    *   **State Resolution:** Automatically looks for `.sst/state.json` or `state.json` in the current working directory.
    *   **CLI Entry:** `cli.ts` handles argument parsing and launches the browser using the `open` package.

2.  **UI (`ui/App.tsx`):**
    *   The React SPA communicates with the backend via `/api`.
    *   **Dynamic Config:** Allows users to manually set or update the state file path via the UI settings.

## Building and Distribution

### Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs both UI (Vite) and Server (tsx) concurrently for development. |
| `npm run build` | Full build: Compiles frontend to `dist/ui` and backend to `dist/cli.js`. |
| `npm start` | Runs the production CLI build from `dist/cli.js`. |

### Distributing as a CLI
This project is configured to be published to npm and used via `npx`:

1.  **Build the project:** `npm run build`
2.  **Test locally:** `node dist/cli.js`
3.  **Link for local use:** `npm link` (allows running `ghost-viewer` in any folder).
4.  **Publish:** `npm publish`

Once published, users can simply run:
```bash
npx @_mustachio/ghost-viewer
```

## Development Notes

*   **State File Logic:** The server uses `process.cwd()` to find the state file in CLI mode. In `npm run dev` mode (triggered by the `isDev` flag in `startServer`), it looks in the parent directory.
*   **Permissions:** Ensure your AWS environment has `tag:GetResources` permissions for the Hunter feature.