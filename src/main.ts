import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, Notice, ObsidianProtocolData } from 'obsidian';
import { AuthManager, CLIENT_ID, TokenResponse } from './auth';
import { MsTodoApi } from './api/ms-todo-api';
import { TodoView, VIEW_TYPE_TODO } from './ui/todo-view';
import { DEFAULT_SETTINGS, MsTodoSettings } from './settings';

export default class MsTodoPlugin extends Plugin {
    settings: MsTodoSettings;
    auth: AuthManager;
    pkceVerifier: string = '';

    async onload() {
        await this.loadSettings();
        this.auth = new AuthManager();

        this.registerObsidianProtocolHandler('mstodo-auth', async (data: ObsidianProtocolData) => {
            await this.handleAuthCallback(data);
        });

        this.registerView(VIEW_TYPE_TODO, (leaf) => new TodoView(leaf, this));
        this.addRibbonIcon('check-square', 'Microsoft To Do', () => this.activateView());

        this.addCommand({
            id: 'sync-to-markdown',
            name: 'Sync Microsoft To Do to markdown',
            callback: () => this.syncTasksToMarkdown(),
        });

        this.addSettingTab(new MsTodoSettingTab(this.app, this));

        if (this.settings.syncOnStartup && this.settings.accessToken) {
            window.setTimeout(() => {
                void this.syncTasksToMarkdown({ silent: true });
            }, 2000);
        }
    }

    async login() {
        if (!CLIENT_ID.includes('Here')) {
            this.pkceVerifier = this.auth.generateCodeVerifier();
            const url = await this.auth.getAuthUrl(this.pkceVerifier);
            window.open(url);
        }
    }

    async handleAuthCallback(data: ObsidianProtocolData) {
        if (data.error) {
            new Notice('Authorization refused');
            return;
        }

        if (data.code) {
            try {
                new Notice('Connecting to Microsoft To Do...');
                const tokens = await this.auth.exchangeCodeForToken(data.code, this.pkceVerifier);
                await this.saveTokens(tokens);
                new Notice('Microsoft To Do connected');
                this.refreshView();
                if (this.settings.syncAfterLogin) {
                    await this.syncTasksToMarkdown({ silent: true });
                }
            } catch (error) {
                console.error(error);
                new Notice('Failed to get token. Check the console.');
            }
        }
    }

    async saveTokens(tokens: TokenResponse) {
        this.settings.accessToken = tokens.access_token;
        this.settings.refreshToken = tokens.refresh_token || this.settings.refreshToken;
        this.settings.tokenExpiresAt = Date.now() + (tokens.expires_in * 1000);
        await this.saveSettings();
    }

    async clearData() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        await this.saveSettings();
    }

    refreshView() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TODO);
        leaves.forEach(leaf => { if (leaf.view instanceof TodoView) void leaf.view.render(); });
    }

    async syncTasksToMarkdown(options: { silent?: boolean } = {}) {
        if (!this.settings.accessToken) {
            new Notice('Sign in to Microsoft To Do first');
            return;
        }

        try {
            const api = new MsTodoApi(this);
            const result = await api.syncAllTasksToMarkdown();
            if (!options.silent) {
                new Notice(`Synced ${result.taskCount} tasks from ${result.listCount} lists to ${result.path}`);
            }
        } catch (error) {
            console.error(error);
            if (!options.silent) {
                new Notice('Failed to sync Microsoft To Do to markdown');
            }
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_TODO);
        if (leaves.length > 0) leaf = leaves[0] as WorkspaceLeaf;
        else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) await leaf.setViewState({ type: VIEW_TYPE_TODO, active: true });
        }
        if (leaf) void workspace.revealLeaf(leaf);
    }
}

class MsTodoSettingTab extends PluginSettingTab {
    plugin: MsTodoPlugin;

    constructor(app: App, plugin: MsTodoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Microsoft To Do')
            .setHeading();

        if (this.plugin.settings.accessToken) {
            new Setting(containerEl)
                .setName('Account status')
                .setDesc('✅ Signed in')
                .addButton(btn => btn
                    .setButtonText('Sign out')
                    .setWarning()
                    .onClick(async () => {
                        await this.plugin.clearData();
                        this.display();
                    })
                );
        } else {
            new Setting(containerEl)
                .setName('Account status')
                .setDesc('❌ Not signed in')
                .addButton(btn => btn
                    .setButtonText('Sign in')
                    .setCta()
                    .onClick(() => {
                        void this.plugin.login();
                    })
                );
        }

        new Setting(containerEl)
            .setName('Markdown sync file')
            .setDesc('Task lists, notes, and checklist steps are written to this vault file.')
            .addText(text => text
                .setPlaceholder('Microsoft To Do.md')
                .setValue(this.plugin.settings.markdownSyncPath)
                .onChange(async (value) => {
                    this.plugin.settings.markdownSyncPath = value.trim() || DEFAULT_SETTINGS.markdownSyncPath;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sync after login')
            .setDesc('Create or update the markdown file after a successful sign in.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncAfterLogin)
                .onChange(async (value) => {
                    this.plugin.settings.syncAfterLogin = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sync on startup')
            .setDesc('Refresh the markdown file shortly after Obsidian starts.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.syncOnStartup = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Manual markdown sync')
            .setDesc('Fetch all Microsoft To Do lists and write them into the markdown file now.')
            .addButton(btn => btn
                .setButtonText('Sync now')
                .setCta()
                .onClick(() => {
                    void this.plugin.syncTasksToMarkdown();
                }));
    }
}
