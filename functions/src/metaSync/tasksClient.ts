// functions/src/metaSync/tasksClient.ts — Phase 14 Layer 2 Cloud Tasks client
// ═══════════════════════════════════════════════════════════
// Wraps the @google-cloud/tasks client. The client is created lazily on
// first use and re-used for the dispatcher's lifetime. We expose a small
// surface (`queuePath`, `enqueueTask`, `serviceAccountEmail`) instead of
// leaking the underlying SDK shape — keeps tests injectable.

type CloudTasksClient = {
    createTask: (req: unknown) => Promise<[unknown, unknown, unknown]>;
    queuePath?: (project: string, region: string, queue: string) => string;
};

let _client: CloudTasksClient | null = null;
let _clientPromise: Promise<CloudTasksClient> | null = null;
let _serviceAccountEmail: string | null = null;

async function ensureClient(): Promise<CloudTasksClient> {
    if (_client) return _client;
    if (_clientPromise) return _clientPromise;
    _clientPromise = (async () => {
        try {
            const mod = await import("@google-cloud/tasks");
            // The v2 client is exposed as `mod.v2.CloudTasksClient` in
            // recent versions; fall back to a default export shape.
            const ClientCtor = (mod as { v2?: { CloudTasksClient: new () => CloudTasksClient } }).v2?.CloudTasksClient
                ?? (mod as unknown as { CloudTasksClient: new () => CloudTasksClient }).CloudTasksClient;
            if (!ClientCtor) {
                throw new Error("@google-cloud/tasks does not export CloudTasksClient");
            }
            const client = new ClientCtor();
            _client = client;
            return client;
        } catch (e) {
            throw new Error(
                "tasksClient: @google-cloud/tasks is not installed. " +
                `Add it to functions/package.json or inject a fake. (${(e as Error).message})`,
            );
        }
    })();
    return _clientPromise;
}

export interface TasksClientFacade {
    queuePath(region: string, project: string, queue: string): string;
    enqueueTask(req: { parent: string; task: unknown }): Promise<unknown>;
    serviceAccountEmail(): string;
}

/**
 * Returns the cached Cloud Tasks client wrapped in a small facade. The
 * facade is intentionally narrow so unit tests can substitute a fake.
 */
export function getTasksClient(): TasksClientFacade {
    return {
        queuePath(region: string, project: string, queue: string): string {
            // The v2 client has `client.queuePath()` as a static method.
            const path = _client?.queuePath?.(project, region, queue);
            if (typeof path === "string") return path;
            return `projects/${project}/locations/${region}/queues/${queue}`;
        },
        async enqueueTask(req: { parent: string; task: unknown }): Promise<unknown> {
            const client = await ensureClient();
            // The v2 client expects `task` to match its CreateTaskRequest type.
            return await client.createTask(req as unknown as Parameters<typeof client.createTask>[0]);
        },
        serviceAccountEmail(): string {
            if (_serviceAccountEmail) return _serviceAccountEmail;
            // The OIDC token for the worker URL must use the project's default
            // App Engine / Cloud Functions SA. We default to the well-known
            // App Engine SA — callers can override via `setTasksServiceAccount`.
            _serviceAccountEmail =
                `proadsai-saas@appspot.gserviceaccount.com`;
            return _serviceAccountEmail;
        },
    };
}

export function setTasksServiceAccount(email: string): void {
    _serviceAccountEmail = email;
}

export function _resetTasksClientForTests(): void {
    _client = null;
    _clientPromise = null;
    _serviceAccountEmail = null;
}
