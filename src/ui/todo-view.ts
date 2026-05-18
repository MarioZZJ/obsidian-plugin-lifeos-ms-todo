import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type MsTodoPlugin from '../main';
import { MsTodoApi, TodoList, TodoTask } from '../api/ms-todo-api';

export const VIEW_TYPE_TODO = 'ms-todo-view';

export class TodoView extends ItemView {
    plugin: MsTodoPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MsTodoPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_TODO; }
    getDisplayText() { return 'Microsoft To Do'; }
    getIcon() { return 'check-square'; }

    async onOpen() {
        await this.render();
    }

    async render() {
        const container = this.contentEl;
        container.empty();
        container.addClass('ms-todo-container');
        container.createEl('h4', { text: 'Microsoft To Do' });

        if (!this.plugin.settings.accessToken) {
            const loginBtn = container.createEl('button', { text: 'Sign in Microsoft To Do' });
            loginBtn.onclick = () => this.plugin.login();
            return;
        }

        const loading = container.createEl('div', { text: 'Loading...' });

        try {
            const api = new MsTodoApi(this.plugin);
            const lists = await api.getTaskLists();

            if (!lists || lists.length === 0) {
                loading.setText('No task lists found');
                return;
            }

            loading.remove();

            const controls = container.createEl('div', { cls: 'todo-controls' });
            const listSelect = controls.createEl('select');
            lists.forEach((list) => {
                const option = listSelect.createEl('option', { text: list.displayName, value: list.id });
                if (list.wellknownListName === 'defaultList') option.selected = true;
            });

            const refreshBtn = controls.createEl('button', { text: 'Refresh' });
            const syncBtn = controls.createEl('button', { text: 'Sync to note' });
            const logoutBtn = controls.createEl('button', { text: 'Sign out' });
            const taskContainer = container.createEl('div');

            const renderSelectedList = async () => {
                const selectedList = lists.find((list) => list.id === listSelect.value) || lists[0];
                if (selectedList) {
                    await this.renderList(api, taskContainer, selectedList);
                }
            };

            listSelect.onchange = () => { void renderSelectedList(); };
            refreshBtn.onclick = () => this.render();
            syncBtn.onclick = () => { void this.plugin.syncTasksToMarkdown(); };
            logoutBtn.onclick = async () => {
                await this.plugin.clearData();
                void this.render();
            };

            await renderSelectedList();
        } catch (error) {
            loading.setText('Error');
            container.createEl('div', { text: String(error), attr: { style: 'color: red' } });
            console.error(error);
        }
    }

    async renderList(api: MsTodoApi, taskContainer: HTMLElement, list: TodoList) {
        taskContainer.empty();
        const tasks = await api.getTasks(list.id);

        if (tasks.length === 0) taskContainer.createEl('div', { text: 'Nothing to do 🎉' });

        tasks.forEach((task) => this.renderTask(api, taskContainer, list, task));

        const input = taskContainer.createEl('input', { placeholder: `Add a task to ${list.displayName}...`, cls: 'todo-add-input' });
        input.addEventListener('keypress', (event: KeyboardEvent) => {
            if (event.key === 'Enter' && input.value.trim()) {
                const title = input.value.trim();
                input.value = '';

                void (async () => {
                    try {
                        await api.createTask(list.id, title);
                        new Notice('Task added');
                        await this.renderList(api, taskContainer, list);
                    } catch (error) {
                        new Notice('Failed to create task');
                        console.error(error);
                        input.value = title;
                    }
                })();
            }
        });
    }

    renderTask(api: MsTodoApi, taskContainer: HTMLElement, list: TodoList, task: TodoTask) {
        const row = taskContainer.createEl('div', { cls: 'todo-item' });
        const checkbox = row.createEl('input', { type: 'checkbox' });
        checkbox.onclick = () => {
            void (async () => {
                try {
                    row.addClass('completed');
                    await api.completeTask(list.id, task.id);
                    window.setTimeout(() => {
                        void this.renderList(api, taskContainer, list);
                    }, 500);
                } catch (error) {
                    row.removeClass('completed');
                    checkbox.checked = false;
                    new Notice('Failed to complete task');
                    console.error(error);
                }
            })();
        };

        const content = row.createDiv({ cls: 'todo-item-content' });
        content.createSpan({ text: task.title });

        const body = stripHtml(task.body?.content || '').trim();
        if (body) content.createEl('small', { text: body, cls: 'todo-item-note' });

        if (task.checklistItems && task.checklistItems.length > 0) {
            const steps = content.createEl('small', { cls: 'todo-item-steps' });
            steps.setText(`${task.checklistItems.filter(item => item.isChecked).length}/${task.checklistItems.length} steps`);
        }
    }
}

function stripHtml(value: string): string {
    return value
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
