const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawnSync } = require('child_process');

// Simple JSON-file backed store for remote MCP server configurations.
// This will be loaded once per application session and mutated in-memory.
// The file lives inside the userData directory so it is private to the user.
class McpServerManager {
  constructor() {
    // Derive the storage location lazily to avoid accessing app.getPath before Electron is ready.
    const userDataPath = app.isReady() ? app.getPath('userData') : path.join(process.cwd(), '.userDataFallback');
    this.filePath = path.join(userDataPath, 'mcp-servers.json');
    this.servers = [];
    this._loadFromDisk();
  }

  /**
   * Return a deep-cloned list of configured servers so callers can mutate
   * without affecting our in-memory state.
   */
  getServers() {
    return JSON.parse(JSON.stringify(this.servers));
  }

  /**
   * Create or update a server entry. If `id` is missing a new one will be
   * generated. The updated list is persisted to disk before returning.
   */
  saveServer(serverConfig) {
    if (!serverConfig) throw new Error('serverConfig required');

    const now = new Date().toISOString();
    let existing = null;

    // Update existing
    if (serverConfig.id) {
      existing = this.servers.find(s => s.id === serverConfig.id);
    }

    if (existing) {
      Object.assign(existing, serverConfig, { updated: now });
    } else {
      const newServer = {
        id: uuidv4(),
        name: 'Unnamed Server',
        transport: 'sse',
        url: '',
        headers: {},
        enabled: true,
        created: now,
        updated: now,
        ...serverConfig
      };
      this.servers.push(newServer);
      existing = newServer;
    }

    this._saveToDisk();
    return existing;
  }

  /** Delete a server by id. Returns true if removed. */
  deleteServer(serverId) {
    const idx = this.servers.findIndex(s => s.id === serverId);
    if (idx === -1) return false;
    this.servers.splice(idx, 1);
    this._saveToDisk();
    return true;
  }

  /** Enable/disable a server */
  toggleServer(serverId, enabled) {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) throw new Error('Server not found');
    server.enabled = !!enabled;
    server.updated = new Date().toISOString();
    this._saveToDisk();
    return server;
  }

  /** Synchronize the claude CLI MCP registry with current enabled servers. */
  syncCli() {
    // Add or update all enabled servers
    const enabledServers = this.servers.filter(s => s.enabled);
    for (const server of enabledServers) {
      const args = ['mcp', 'add', '--transport', server.transport, server.name, server.url];
      if (server.headers) {
        for (const [k, v] of Object.entries(server.headers)) {
          args.push('--header', `${k}: ${v}`);
        }
      }
      spawnSync('claude', args, { stdio: 'ignore' });
    }

    // Remove disabled servers (best-effort)
    const disabled = this.servers.filter(s => !s.enabled);
    for (const server of disabled) {
      spawnSync('claude', ['mcp', 'remove', server.name], { stdio: 'ignore' });
    }
  }

  _loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        this.servers = JSON.parse(data);
      }
    } catch (err) {
      console.warn('Failed to load MCP servers file – starting fresh:', err.message);
      this.servers = [];
    }
  }

  _saveToDisk() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.servers, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save MCP servers to disk:', err);
    }
  }
}

module.exports = new McpServerManager();