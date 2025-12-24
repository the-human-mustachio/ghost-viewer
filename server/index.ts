import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
} from "@aws-sdk/client-resource-groups-tagging-api";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isS3Path(p: string): boolean {
  return p.startsWith("s3://");
}

async function readStateFile(p: string): Promise<any> {
  let actualPath = p;
  let region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

  // Check for region suffix if it's an S3 path (e.g. s3://bucket/key:us-west-2)
  if (p.startsWith("s3://") && p.lastIndexOf(":") > 4) {
    const lastColon = p.lastIndexOf(":");
    const potentialRegion = p.substring(lastColon + 1);
    if (potentialRegion.match(/^[a-z]{2}-[a-z]+-\d+$/)) {
        region = potentialRegion;
        actualPath = p.substring(0, lastColon);
    }
  }

  if (isS3Path(actualPath)) {
    const url = new URL(actualPath);
    const bucket = url.hostname;
    const key = url.pathname.substring(1);
    const client = new S3Client({ region }); 
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await client.send(command);
    const data = await response.Body?.transformToString();
    if (!data) throw new Error("Empty S3 object");
    return JSON.parse(data);
  } else {
    if (!fs.existsSync(p)) throw new Error("File not found");
    const data = fs.readFileSync(p, "utf-8");
    return JSON.parse(data);
  }
}

function findSstV2State(root: string): { path: string; app: string; stage: string } | null {
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

    const foundPath = search(pulumiRoot);
    return foundPath ? { path: foundPath, app, stage } : null;
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
    let DETECTED_APP = "";
    let DETECTED_STAGE = "";

    // Try to auto-locate state.json if not provided
    if (!STATE_FILE) {
        // 1. Check for Ion (SST v3)
        const v3State = path.join(PROJECT_ROOT, ".sst", "state.json");
        
        // 2. Check for SST v2 (Pulumi)
        const v2State = findSstV2State(PROJECT_ROOT);

        if (fs.existsSync(v3State)) {
            STATE_FILE = v3State;
        } else if (v2State) {
            STATE_FILE = v2State.path;
            DETECTED_APP = v2State.app;
            DETECTED_STAGE = v2State.stage;
        } else if (fs.existsSync(path.join(PROJECT_ROOT, "state.json"))) {
            STATE_FILE = path.join(PROJECT_ROOT, "state.json");
        }
    }

    console.log(`[Backend] Root: ${PROJECT_ROOT}`);
    console.log(`[Backend] State: ${STATE_FILE || "Not found (use Settings in UI)"}`);

    // --- API ---

    // 1. GET /api/config
    app.get("/api/config", (_req, res) => {
        const exists = isS3Path(STATE_FILE) ? true : fs.existsSync(STATE_FILE);
        res.json({
            stateFile: STATE_FILE,
            projectRoot: PROJECT_ROOT,
            exists,
            app: DETECTED_APP,
            stage: DETECTED_STAGE
        });
    });

    // 1b. POST /api/config (Update state file path)
    app.post("/api/config", (req, res) => {
        const { stateFile } = req.body;
        if (stateFile && typeof stateFile === 'string') {
            STATE_FILE = stateFile;
        }
        
        // Try to re-detect if it's an SST project
        const v2State = findSstV2State(PROJECT_ROOT);
        let appName = "";
        let stageName = "";
        if (v2State && v2State.path === STATE_FILE) {
            appName = v2State.app;
            stageName = v2State.stage;
        }

        const exists = isS3Path(STATE_FILE) ? true : fs.existsSync(STATE_FILE);
        res.json({
            stateFile: STATE_FILE,
            projectRoot: PROJECT_ROOT,
            exists,
            app: appName,
            stage: stageName
        });
    });

    // 2. GET /api/state
    app.get("/api/state", async (_req, res) => {
        try {
            const data = await readStateFile(STATE_FILE);
            res.json(data);
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
            try {
                const state = await readStateFile(STATE_FILE);
                const resources = state.latest?.resources || state.checkpoint?.latest?.resources || state.deployment?.resources || [];
                resources.forEach((r: any) => {
                    if (r.id) managedIds.add(r.id);
                    if (r.outputs?.arn) managedIds.add(r.outputs.arn);
                });
            } catch (e) {
                console.log("[Backend] Warning: Could not read state file for scan comparison:", e);
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