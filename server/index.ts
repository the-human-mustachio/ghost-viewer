import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
} from "@aws-sdk/client-resource-groups-tagging-api";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startServer(options: { port?: number; openBrowser?: boolean; isDev?: boolean } = {}) {
    const app = express();
    const PORT = options.port || 3001;

    app.use(cors());
    app.use(express.json());

    // --- CONFIG ---
    let PROJECT_ROOT = process.cwd();
    let STATE_FILE = process.env.STATE_PATH || "";

    if (options.isDev) {
        PROJECT_ROOT = path.resolve(process.cwd(), "..");
    }

    // --- API ---

    // 1. GET /api/config
    app.get("/api/config", (_req, res) => {
        res.json({
            stateFile: STATE_FILE,
            projectRoot: PROJECT_ROOT,
            exists: fs.existsSync(STATE_FILE)
        });
    });

    // 1b. POST /api/config (Update state file path)
    app.post("/api/config", (req, res) => {
        const { stateFile } = req.body;
        if (stateFile && typeof stateFile === 'string') {
            STATE_FILE = stateFile;
        }
        res.json({
            stateFile: STATE_FILE,
            projectRoot: PROJECT_ROOT,
            exists: fs.existsSync(STATE_FILE)
        });
    });

    // 2. GET /api/state
    app.get("/api/state", (_req, res) => {
        if (!fs.existsSync(STATE_FILE)) {
            return res.status(404).json({ error: "State file not found. Please set the path in Settings." });
        }
        try {
            const data = fs.readFileSync(STATE_FILE, "utf-8");
            res.json(JSON.parse(data));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // 3. POST /api/scan
    app.post("/api/scan", async (req, res) => {
        const { appName, stage, region } = req.body;

        if (!appName || !stage || !region) {
            return res.status(400).json({ error: "Missing required params: appName, stage, region" });
        }

        try {
            // Load State IDs for comparison
            let managedIds = new Set<string>();
            if (fs.existsSync(STATE_FILE)) {
                const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
                const resources = state.latest?.resources || state.checkpoint?.latest?.resources || state.deployment?.resources || [];
                resources.forEach((r: any) => {
                    if (r.id) managedIds.add(r.id);
                    if (r.outputs?.arn) managedIds.add(r.outputs.arn);
                });
            }

            const client = new ResourceGroupsTaggingAPIClient({ region });
            let awsResources: any[] = [];
            let token: string | undefined;

            console.log(`Starting scan for App:${appName} Stage:${stage} in ${region}...`);

            do {
                const filters: any[] = [];
                if (appName !== "*") filters.push({ Key: "sst:app", Values: [appName] });
                else filters.push({ Key: "sst:app" }); // Wildcard

                if (stage !== "*") filters.push({ Key: "sst:stage", Values: [stage] });
                else filters.push({ Key: "sst:stage" }); // Wildcard

                const command: GetResourcesCommand = new GetResourcesCommand({
                    TagFilters: filters,
                    PaginationToken: token,
                });

                const response = await client.send(command);
                awsResources = awsResources.concat(response.ResourceTagMappingList || []);
                token = response.PaginationToken;
            } while (token);

            // Process Orphans
            const orphans = awsResources.filter((res) => {
                const arn = res.ResourceARN || "";
                if (managedIds.has(arn)) return false;
                // Fuzzy match suffix
                for (const id of managedIds) {
                    if (arn.endsWith(id)) return false;
                }
                return true;
            }).map(o => ({
                arn: o.ResourceARN,
                type: o.ResourceARN?.split(":")[2],
                tags: o.Tags?.reduce((acc: any, t: any) => ({ ...acc, [t.Key]: t.Value }), {}) || {},
                name: o.Tags?.find((t: any) => t.Key === "Name")?.Value || o.ResourceARN?.split(/[:/]/).pop()
            }));

            res.json({
                totalFound: awsResources.length,
                orphans,
                managedCount: managedIds.size
            });

        } catch (e: any) {
            console.error(e);
            let message = e.message;
            if (e.name === 'ExpiredTokenException' || e.__type === 'ExpiredTokenException' || message.includes('expired')) {
                message = "AWS Credentials expired or invalid. Please check your environment or run 'aws sso login'.";
            }
            res.status(500).json({ error: message });
        }
    });

    // Serve Static UI (Production)
    // When bundled with tsup/pkg, __dirname might behave differently, but generally:
    // We expect the UI files to be in a sibling 'ui' directory relative to this script's output location (dist/cli.js -> dist/ui)
    const uiPath = path.resolve(__dirname, 'ui'); 
    app.use(express.static(uiPath));
    app.get("*", (_req, res) => {
        res.sendFile(path.join(uiPath, "index.html"));
    });

    const startListening = (port: number) => {
        const server = app.listen(port, async () => {
            console.log(`Ghost Viewer running on http://localhost:${port}`);
            if (options.openBrowser) {
                 const open = (await import('open')).default;
                 open(`http://localhost:${port}`);
            }
        });

        server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} is in use, trying ${port + 1}...`);
                startListening(port + 1);
            } else {
                console.error("Server error:", err);
            }
        });
        
        return server;
    };

    return startListening(PORT);
}

// Auto-start if run directly (e.g. via tsx)
if (process.argv[1] && process.argv[1].endsWith('server/index.ts')) {
    startServer({ isDev: true });
}