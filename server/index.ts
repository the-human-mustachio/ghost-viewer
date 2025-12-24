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

function findSstV2State(root: string): string | null {
  console.log(`[findSstV2State] Searching in: ${root}`);
  try {
    const stagePath = path.join(root, ".sst", "stage");
    if (!fs.existsSync(stagePath)) {
        console.log(`[findSstV2State] .sst/stage not found at: ${stagePath}`);
        return null;
    }
    const stage = fs.readFileSync(stagePath, "utf-8").trim();
    console.log(`[findSstV2State] Found stage: ${stage}`);

    let app = "";

    // 1. Try sst.config.ts (Most reliable for SST v2)
    const configPath = path.join(root, "sst.config.ts");
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      const match = content.match(/name:\s*["']([^"']+)["']/);
      if (match) {
          app = match[1];
          console.log(`[findSstV2State] Found app name from sst.config.ts: ${app}`);
      }
    }

    // 2. Fallback to sst.json
    if (!app) {
      const sstJsonPath = path.join(root, "sst.json");
      if (fs.existsSync(sstJsonPath)) {
        try {
          const sstJson = JSON.parse(fs.readFileSync(sstJsonPath, "utf-8"));
          if (sstJson.name) {
              app = sstJson.name;
              console.log(`[findSstV2State] Found app name from sst.json: ${app}`);
          }
        } catch {}
      }
    }

    // 3. Fallback to package.json
    if (!app) {
      const pkgPath = path.join(root, "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          app = pkg.name?.split('/').pop() || "";
          console.log(`[findSstV2State] Found app name from package.json: ${app}`);
        } catch {}
      }
    }

    if (!app) {
        console.log("[findSstV2State] Could not determine app name.");
        return null;
    }

    const pulumiRoot = path.join(root, ".sst", "pulumi");
    if (!fs.existsSync(pulumiRoot)) {
        console.log(`[findSstV2State] .sst/pulumi not found at: ${pulumiRoot}`);
        return null;
    }

    const stackFile = `${stage}.json`;
    console.log(`[findSstV2State] Looking for stack file: ${stackFile}`);
    
    // SST v2 path: .sst/pulumi/<hash>/.pulumi/stacks/<app>/<stage>.json
    // We search for the first .pulumi directory we find in .sst/pulumi
    const search = (dir: string): string | null => {
      console.log(`[findSstV2State] Scanning directory: ${dir}`);
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === ".pulumi") {
            const target = path.join(fullPath, "stacks", app, stackFile);
            console.log(`[findSstV2State] Checking target: ${target}`);
            if (fs.existsSync(target)) {
                console.log(`[findSstV2State] SUCCESS: Found state file at ${target}`);
                return target;
            }
          }
          // Only go 2 levels deep for the hash search to be efficient
          const relative = path.relative(pulumiRoot, fullPath);
          if (relative.split(path.sep).length < 2) {
            const found = search(fullPath);
            if (found) return found;
          }
        }
      }
      return null;
    };

    return search(pulumiRoot);
  } catch (e) {
    console.error("[Backend] Error auto-detecting SST v2 state:", e);
    return null;
  }
}

export function startServer(options: { port?: number; openBrowser?: boolean; isDev?: boolean } = {}) {
    const app = express();
    const PORT = options.port || 3001;

    app.use(cors());
    app.use(express.json());

    // --- CONFIG ---
    const PROJECT_ROOT = process.cwd();
    let STATE_FILE = process.env.STATE_PATH || "";

    // Try to auto-locate state.json if not provided
    if (!STATE_FILE) {
        // 1. Check for Ion (SST v3)
        const v3State = path.join(PROJECT_ROOT, ".sst", "state.json");
        
        // 2. Check for SST v2 (Pulumi)
        const v2State = findSstV2State(PROJECT_ROOT);

        if (fs.existsSync(v3State)) {
            STATE_FILE = v3State;
        } else if (v2State) {
            STATE_FILE = v2State;
        } else if (fs.existsSync(path.join(PROJECT_ROOT, "state.json"))) {
            STATE_FILE = path.join(PROJECT_ROOT, "state.json");
        }
    }

    console.log(`[Backend] Root: ${PROJECT_ROOT}`);
    console.log(`[Backend] State: ${STATE_FILE || "Not found (use Settings in UI)"}`);

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
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)))) {
    console.log("[Backend] Starting in development mode...");
    startServer({ isDev: true });
}