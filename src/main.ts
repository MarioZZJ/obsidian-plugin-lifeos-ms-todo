import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, Notice, ObsidianProtocolData } from 'obsidian';
import { AuthManager, CLIENT_ID, TokenResponse } from './auth';
import { MsTodoApi } from './api/ms-todo-api';
import type { TodoList } from './api/ms-todo-api';
import { TodoView, VIEW_TYPE_TODO } from './ui/todo-view';
import { DEFAULT_SETTINGS, MsTodoSettings } from './settings';
import { LifeOsSyncService } from './sync/lifeos-sync';
import {
	defaultProjectNotePathFromTag,
	type LifeOsTodoListMapping,
} from './sync/lifeos-markdown';

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
            name: 'Sync configured target',
            callback: () => this.syncConfiguredTarget(),
        });

        this.addCommand({
            id: 'sync-lifeos-ms-todo',
            name: 'Sync tasks to LifeOS',
            callback: () => this.syncLifeOsTasks(),
        });

        this.addSettingTab(new MsTodoSettingTab(this.app, this));

        if (this.settings.syncOnStartup && this.settings.accessToken) {
            window.setTimeout(() => {
                void this.syncConfiguredTarget({ silent: true });
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
                    await this.syncConfiguredTarget({ silent: true });
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
        this.settings = this.buildDefaultSettings();
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
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`Failed to sync Microsoft To Do to markdown: ${message}`);
            }
        }
    }

    async syncLifeOsTasks(options: { silent?: boolean } = {}) {
        if (!this.settings.accessToken) {
            new Notice('Sign in to Microsoft To Do first');
            return;
        }

        if (!this.settings.lifeosSyncEnabled) {
            if (!options.silent) new Notice('Enable LifeOS sync in settings first');
            return;
        }

        try {
            const api = new MsTodoApi(this);
            const result = await new LifeOsSyncService(this, api).sync();
            if (result.skipped) {
                if (!options.silent) new Notice(result.reason || 'LifeOS sync skipped');
                return;
            }

            if (!options.silent) {
                const warnings: string[] = [];
                if (result.unmappedListNames.length > 0) warnings.push(`${result.unmappedListNames.length} unmapped lists`);
                if (result.missingProjectPaths.length > 0) warnings.push(`${result.missingProjectPaths.length} missing project files`);
                const suffix = warnings.length > 0 ? ` (${warnings.join(', ')})` : '';
                new Notice(`LifeOS synced ${result.taskCount} tasks: ${result.projectFileCount} project files, ${result.inboxTaskCount} inbox tasks, ${result.dailyTaskCount} daily links${suffix}`);
            }
        } catch (error) {
            console.error(error);
            if (!options.silent) {
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`Failed to sync LifeOS Microsoft To Do: ${message}`);
            }
        }
    }

    async syncConfiguredTarget(options: { silent?: boolean } = {}) {
        if (this.settings.lifeosSyncEnabled) {
            await this.syncLifeOsTasks(options);
            return;
        }

        await this.syncTasksToMarkdown(options);
    }

    async loadSettings() {
        const savedSettings = await this.loadData() as Partial<MsTodoSettings> | null;
        this.settings = Object.assign(this.buildDefaultSettings(), savedSettings || {});
        this.settings.todoListMappings = Array.isArray(this.settings.todoListMappings)
            ? this.settings.todoListMappings
            : [];
        if (
            this.settings.lifeosSyncEnabled
            && this.settings.markdownSyncPath === DEFAULT_SETTINGS.markdownSyncPath
            && this.settings.unmappedInboxPath === 'Microsoft To Do Inbox.md'
        ) {
            this.settings.unmappedInboxPath = DEFAULT_SETTINGS.unmappedInboxPath;
            await this.saveSettings();
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    buildDefaultSettings(): MsTodoSettings {
        return {
            ...DEFAULT_SETTINGS,
            todoListMappings: [...DEFAULT_SETTINGS.todoListMappings],
        };
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

        if (!this.plugin.settings.lifeosSyncEnabled) {
            new Setting(containerEl)
                .setName('Legacy markdown sync file')
                .setDesc('Full-list markdown snapshot. LifeOS sync does not use this path.')
                .addText(text => text
                    .setPlaceholder(DEFAULT_SETTINGS.markdownSyncPath)
                    .setValue(this.plugin.settings.markdownSyncPath)
                    .onChange(async (value) => {
                        this.plugin.settings.markdownSyncPath = value.trim() || DEFAULT_SETTINGS.markdownSyncPath;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Manual legacy markdown sync')
                .setDesc('Fetch all Microsoft To Do lists and write a full markdown snapshot now.')
                .addButton(btn => btn
                    .setButtonText('Sync legacy markdown')
                    .setCta()
                    .onClick(() => {
                        void this.plugin.syncTasksToMarkdown();
                    }));
        }

        new Setting(containerEl)
            .setName('LifeOS sync')
            .setHeading();

        new Setting(containerEl)
            .setName('Enable LifeOS sync')
            .setDesc('Write Microsoft To Do into LifeOS daily notes, project README files, and inbox controlled blocks.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.lifeosSyncEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.lifeosSyncEnabled = value;
                    if (
                        value
                        && this.plugin.settings.markdownSyncPath === DEFAULT_SETTINGS.markdownSyncPath
                        && this.plugin.settings.unmappedInboxPath === 'Microsoft To Do Inbox.md'
                    ) {
                        this.plugin.settings.unmappedInboxPath = DEFAULT_SETTINGS.unmappedInboxPath;
                    }
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Expected vault name')
            .setDesc('LifeOS sync stops if the current vault name does not match this value. Leave empty to disable the guard.')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.expectedVaultName)
                .setValue(this.plugin.settings.expectedVaultName)
                .onChange(async (value) => {
                    this.plugin.settings.expectedVaultName = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Daily note path pattern')
            .setDesc('Supports {{YYYY}}, {{MM}}, {{DD}}, and {{YYYY-MM-DD}}.')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.dailyNotePathPattern)
                .setValue(this.plugin.settings.dailyNotePathPattern)
                .onChange(async (value) => {
                    this.plugin.settings.dailyNotePathPattern = value.trim() || DEFAULT_SETTINGS.dailyNotePathPattern;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Daily template path')
            .setDesc('Used when today\'s daily note does not exist.')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.dailyTemplatePath)
                .setValue(this.plugin.settings.dailyTemplatePath)
                .onChange(async (value) => {
                    this.plugin.settings.dailyTemplatePath = value.trim() || DEFAULT_SETTINGS.dailyTemplatePath;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Daily task heading')
            .setDesc('The heading where the read-only Microsoft To Do daily links are inserted.')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.dailyTaskHeading)
                .setValue(this.plugin.settings.dailyTaskHeading)
                .onChange(async (value) => {
                    this.plugin.settings.dailyTaskHeading = value.trim() || DEFAULT_SETTINGS.dailyTaskHeading;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Unmapped inbox path')
            .setDesc('LifeOS fallback file for unmapped lists and missing project files. This replaces the old full markdown snapshot path.')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.unmappedInboxPath)
                .setValue(this.plugin.settings.unmappedInboxPath)
                .onChange(async (value) => {
                    this.plugin.settings.unmappedInboxPath = value.trim() || DEFAULT_SETTINGS.unmappedInboxPath;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Project note path pattern')
            .setDesc('Used when a list mapping has a project tag but no override path. Supports {{AREA}} and {{PROJECT}}.')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.projectNotePathPattern)
                .setValue(this.plugin.settings.projectNotePathPattern)
                .onChange(async (value) => {
                    this.plugin.settings.projectNotePathPattern = value.trim() || DEFAULT_SETTINGS.projectNotePathPattern;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Project template path')
            .setDesc('Used only when creating a missing project note is enabled. Supports project placeholders inside the template.')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.projectTemplatePath)
                .setValue(this.plugin.settings.projectTemplatePath)
                .onChange(async (value) => {
                    this.plugin.settings.projectTemplatePath = value.trim() || DEFAULT_SETTINGS.projectTemplatePath;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Create missing project notes')
            .setDesc('If disabled, tasks for missing project README files are sent to the fallback file instead.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.createMissingProjectNotes)
                .onChange(async (value) => {
                    this.plugin.settings.createMissingProjectNotes = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Project sync heading')
            .setDesc('The top-level heading that owns the controlled project task block.')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.projectTodoHeading)
                .setValue(this.plugin.settings.projectTodoHeading)
                .onChange(async (value) => {
                    this.plugin.settings.projectTodoHeading = value.trim() || DEFAULT_SETTINGS.projectTodoHeading;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Insert project sync before heading')
            .setDesc('When a project note has no existing sync section, insert it before this exact heading. Leave empty to append at the end.')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.projectInsertBeforeHeading)
                .setValue(this.plugin.settings.projectInsertBeforeHeading)
                .onChange(async (value) => {
                    this.plugin.settings.projectInsertBeforeHeading = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Manual LifeOS sync')
            .setDesc('Fetch Microsoft To Do and update LifeOS controlled blocks now.')
            .addButton(btn => btn
                .setButtonText('Sync LifeOS now')
                .setCta()
                .onClick(() => {
                    void this.plugin.syncLifeOsTasks();
                }));

        this.renderLifeOsMappings(containerEl);
    }

    renderLifeOsMappings(containerEl: HTMLElement) {
        const mappingsContainer = containerEl.createDiv({ cls: 'mstodo-lifeos-mappings' });

        new Setting(mappingsContainer)
            .setName('LifeOS list mappings')
            .setDesc('Map each Microsoft To Do list to a LifeOS project tag. The project README path is optional.')
            .setHeading();

        if (!this.plugin.settings.accessToken) {
            mappingsContainer.createEl('p', { text: 'Sign in to Microsoft To Do to load lists.' });
            return;
        }

        mappingsContainer.createEl('p', { text: 'Loading Microsoft To Do lists...' });
        void this.renderLifeOsMappingRows(mappingsContainer);
    }

    async renderLifeOsMappingRows(containerEl: HTMLElement) {
        try {
            const lists = await new MsTodoApi(this.plugin).getTaskLists();
            containerEl.empty();

            new Setting(containerEl)
                .setName('LifeOS list mappings')
                .setDesc('Blank project tag sends the list to the fallback file. Blank path uses the configured project note path pattern.')
                .setHeading();

            lists.forEach((list) => this.renderLifeOsMappingRow(containerEl, list));
        } catch (error) {
            console.error(error);
            containerEl.empty();
            containerEl.createEl('p', { text: 'Failed to load Microsoft To Do lists. Check sign-in status and try again.' });
        }
    }

    renderLifeOsMappingRow(containerEl: HTMLElement, list: TodoList) {
        const mapping = this.findMapping(list);
        new Setting(containerEl)
            .setName(list.displayName)
            .setDesc(`List ID: ${list.id}`)
            .addText(text => text
                .setPlaceholder('#领域/项目')
                .setValue(mapping.projectTag)
                .onChange(async (value) => {
                    await this.updateMapping(list, { projectTag: value.trim() });
                }))
            .addText(text => text
                .setPlaceholder(defaultProjectNotePathFromTag(mapping.projectTag, this.plugin.settings.projectNotePathPattern) || 'Optional override path')
                .setValue(mapping.projectNotePath)
                .onChange(async (value) => {
                    await this.updateMapping(list, { projectNotePath: value.trim() });
                }))
            .addToggle(toggle => toggle
                .setValue(mapping.includeInDaily)
                .onChange(async (value) => {
                    await this.updateMapping(list, { includeInDaily: value });
                }));
    }

    findMapping(list: TodoList): LifeOsTodoListMapping {
        return this.plugin.settings.todoListMappings.find((mapping) => mapping.listId === list.id) || {
            listId: list.id,
            listName: list.displayName,
            projectTag: '',
            projectNotePath: '',
            includeInDaily: false,
        };
    }

    async updateMapping(list: TodoList, changes: Partial<LifeOsTodoListMapping>) {
        const current = this.findMapping(list);
        const next: LifeOsTodoListMapping = {
            ...current,
            listId: list.id,
            listName: list.displayName,
            ...changes,
        };
        const rest = this.plugin.settings.todoListMappings.filter((mapping) => mapping.listId !== list.id);
        const shouldKeep = Boolean(next.projectTag.trim() || next.projectNotePath.trim() || next.includeInDaily);
        this.plugin.settings.todoListMappings = shouldKeep ? [...rest, next] : rest;
        await this.plugin.saveSettings();
    }
}
