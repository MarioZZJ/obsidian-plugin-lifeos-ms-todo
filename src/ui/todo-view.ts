import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type MsTodoPlugin from '../main';
import { MsTodoApi, TodoList, TodoTask } from '../api/ms-todo-api';

export const VIEW_TYPE_TODO = 'ms-todo-view';

export class TodoView extends ItemView {
    plugin: MsTodoPlugin;
    selectedListId: string | null = null;
    selectedTaskId: string | null = null;
    showCompleted = false;
    currentTasks: TodoTask[] = [];

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

        if (!this.plugin.settings.accessToken) {
            this.renderSignedOut(container);
            return;
        }

        const loading = container.createEl('div', { text: 'Loading Microsoft To Do...', cls: 'todo-loading' });

        try {
            const api = new MsTodoApi(this.plugin);
            const lists = await api.getTaskLists();

            if (!lists || lists.length === 0) {
                loading.remove();
                this.renderEmptyLists(container, api);
                return;
            }

            loading.remove();
            const selectedList = this.resolveSelectedList(lists);
            if (!selectedList) return;
            await this.renderShell(api, container, lists, selectedList);
        } catch (error) {
            loading.setText('Error');
            container.createEl('div', { text: String(error), cls: 'todo-error' });
            console.error(error);
        }
    }

    renderSignedOut(container: HTMLElement) {
        const hero = container.createDiv({ cls: 'todo-signed-out' });
        hero.createDiv({ text: '✓', cls: 'todo-signed-out-icon' });
        hero.createEl('h3', { text: 'Microsoft To Do' });
        hero.createEl('p', { text: 'Sign in to view lists, edit notes, set due dates, and sync tasks to Obsidian notes.' });
        const loginBtn = hero.createEl('button', { text: 'Sign in Microsoft To Do', cls: 'todo-primary-button' });
        loginBtn.onclick = () => this.plugin.login();
    }

    renderEmptyLists(container: HTMLElement, api: MsTodoApi) {
        const hero = container.createDiv({ cls: 'todo-signed-out' });
        hero.createDiv({ text: '+', cls: 'todo-signed-out-icon' });
        hero.createEl('h3', { text: 'Create your first list' });
        const input = hero.createEl('input', { placeholder: 'List name', cls: 'todo-list-create-input' });
        const createBtn = hero.createEl('button', { text: 'Create list', cls: 'todo-primary-button' });
        createBtn.onclick = () => { void this.createList(api, input.value); };
    }

    resolveSelectedList(lists: TodoList[]): TodoList | null {
        const existing = this.selectedListId ? lists.find((list) => list.id === this.selectedListId) : null;
        const defaultList = lists.find((list) => list.wellknownListName === 'defaultList');
        const selectedList = existing || defaultList || lists[0] || null;
        this.selectedListId = selectedList?.id || null;
        return selectedList;
    }

    async renderShell(api: MsTodoApi, container: HTMLElement, lists: TodoList[], selectedList: TodoList) {
        const app = container.createDiv({ cls: 'todo-app-shell' });
        const header = app.createDiv({ cls: 'todo-header' });
        const headerTitle = header.createDiv({ cls: 'todo-header-title' });
        headerTitle.createEl('span', { text: 'Microsoft To Do', cls: 'todo-brand' });
        headerTitle.createEl('span', { text: selectedList.displayName, cls: 'todo-list-title' });

        const headerActions = header.createDiv({ cls: 'todo-header-actions' });
        const refreshBtn = headerActions.createEl('button', { text: 'Refresh', cls: 'todo-ghost-button' });
        const syncBtn = headerActions.createEl('button', { text: 'Sync to note', cls: 'todo-primary-button' });
        const logoutBtn = headerActions.createEl('button', { text: 'Sign out', cls: 'todo-ghost-button' });
        refreshBtn.onclick = () => this.render();
        syncBtn.onclick = () => { void this.plugin.syncConfiguredTarget(); };
        logoutBtn.onclick = async () => {
            await this.plugin.clearData();
            void this.render();
        };

        const body = app.createDiv({ cls: 'todo-body' });
        const sidebar = body.createDiv({ cls: 'todo-list-sidebar' });
        const main = body.createDiv({ cls: 'todo-main-panel' });

        this.renderListSidebar(api, sidebar, lists);
        await this.loadTaskList(api, main, selectedList);
    }

    renderListSidebar(api: MsTodoApi, sidebar: HTMLElement, lists: TodoList[]) {
        const heading = sidebar.createDiv({ cls: 'todo-list-sidebar-heading' });
        heading.createEl('div', { text: 'Lists', cls: 'todo-section-label' });

        lists.forEach((list) => {
            const row = sidebar.createDiv({ cls: 'todo-list-nav-row' });
            if (list.id === this.selectedListId) row.addClass('is-active');
            const item = row.createEl('button', { text: list.displayName, cls: 'todo-list-nav-item' });
            item.onclick = () => {
                if (this.selectedListId === list.id) return;
                this.selectedListId = list.id;
                this.selectedTaskId = null;
                void this.render();
            };

            if (list.wellknownListName !== 'defaultList') {
                const deleteBtn = row.createEl('button', { text: '×', cls: 'todo-list-delete-button' });
                deleteBtn.setAttr('aria-label', `Delete ${list.displayName}`);
                deleteBtn.onclick = (event) => {
                    event.stopPropagation();
                    void this.deleteList(api, list);
                };
            }
        });

        const add = sidebar.createDiv({ cls: 'todo-list-add' });
        add.createSpan({ text: '+', cls: 'todo-add-icon' });
        const input = add.createEl('input', { placeholder: 'New list' });
        const create = () => { void this.createList(api, input.value); };
        input.addEventListener('keypress', (event: KeyboardEvent) => {
            if (event.key === 'Enter') create();
        });
        const button = add.createEl('button', { text: 'Add', cls: 'todo-link-button' });
        button.onclick = create;
    }

    async createList(api: MsTodoApi, displayName: string) {
        const name = displayName.trim();
        if (!name) return;
        try {
            const list = await api.createTaskList(name);
            this.selectedListId = list.id;
            this.selectedTaskId = null;
            new Notice('List created');
            await this.render();
        } catch (error) {
            new Notice('Failed to create list');
            console.error(error);
        }
    }

    async deleteList(api: MsTodoApi, list: TodoList) {
        if (!window.confirm(`Delete list "${list.displayName}"? Tasks in this list will also be deleted.`)) return;
        try {
            await api.deleteTaskList(list.id);
            if (this.selectedListId === list.id) {
                this.selectedListId = null;
                this.selectedTaskId = null;
            }
            new Notice('List deleted');
            await this.render();
        } catch (error) {
            new Notice('Failed to delete list');
            console.error(error);
        }
    }

    async loadTaskList(api: MsTodoApi, main: HTMLElement, list: TodoList) {
        main.empty();
        const toolbar = main.createDiv({ cls: 'todo-toolbar' });
        const title = toolbar.createEl('h3', { text: list.displayName });
        title.addClass('todo-panel-heading');
        const completedToggle = toolbar.createEl('button', {
            text: this.showCompleted ? 'Hide completed' : 'Show completed',
            cls: 'todo-ghost-button',
        });
        completedToggle.onclick = () => {
            this.showCompleted = !this.showCompleted;
            this.selectedTaskId = null;
            void this.loadTaskList(api, main, list);
        };

        const addBox = main.createDiv({ cls: 'todo-add-card' });
        addBox.createSpan({ text: '+', cls: 'todo-add-icon' });
        const input = addBox.createEl('input', { placeholder: 'Add a task' });
        input.addEventListener('keypress', (event: KeyboardEvent) => {
            if (event.key === 'Enter' && input.value.trim()) {
                const taskTitle = input.value.trim();
                input.value = '';
                void (async () => {
                    try {
                        const task = await api.createTask(list.id, taskTitle);
                        this.currentTasks = [task, ...this.currentTasks];
                        this.selectedTaskId = task.id;
                        new Notice('Task added');
                        this.renderTaskList(api, list, listArea, detail);
                        this.selectTask(api, list, listArea, detail, task);
                    } catch (error) {
                        new Notice('Failed to create task');
                        console.error(error);
                        input.value = taskTitle;
                    }
                })();
            }
        });

        const listArea = main.createDiv({ cls: 'todo-task-list-area' });
        const detail = main.createDiv({ cls: 'todo-detail-panel' });
        this.currentTasks = await api.getTasks(list.id, this.showCompleted);
        this.renderTaskList(api, list, listArea, detail);
    }

    renderTaskList(api: MsTodoApi, list: TodoList, listArea: HTMLElement, detail: HTMLElement) {
        listArea.empty();
        detail.empty();
        detail.removeClass('is-open');

        const activeTasks = this.currentTasks.filter((task) => task.status !== 'completed');
        const completedTasks = this.currentTasks.filter((task) => task.status === 'completed');

        if (activeTasks.length === 0 && (!this.showCompleted || completedTasks.length === 0)) {
            listArea.createEl('div', { text: 'Nothing to do 🎉', cls: 'todo-empty' });
        }

        activeTasks.forEach((task) => this.renderTaskRow(api, listArea, detail, list, task));

        if (this.showCompleted && completedTasks.length > 0) {
            listArea.createEl('div', { text: `Completed ${completedTasks.length}`, cls: 'todo-completed-heading' });
            completedTasks.forEach((task) => this.renderTaskRow(api, listArea, detail, list, task));
        }

        if (this.selectedTaskId) {
            const selectedTask = this.currentTasks.find((task) => task.id === this.selectedTaskId);
            if (selectedTask) this.selectTask(api, list, listArea, detail, selectedTask);
        }
    }

    renderTaskRow(api: MsTodoApi, listArea: HTMLElement, detail: HTMLElement, list: TodoList, task: TodoTask) {
        const row = listArea.createEl('button', { cls: 'todo-task-card', attr: { 'data-task-id': task.id } });
        if (task.id === this.selectedTaskId) row.addClass('is-selected');
        if (task.status === 'completed') row.addClass('is-completed');

        const checkbox = row.createEl('input', { type: 'checkbox' });
        checkbox.checked = task.status === 'completed';
        checkbox.onclick = (event) => {
            event.stopPropagation();
            void (async () => {
                try {
                    const updatedTask = task.status === 'completed'
                        ? await api.reopenTask(list.id, task.id)
                        : await api.completeTask(list.id, task.id);
                    this.replaceTask(updatedTask);
                    if (!this.showCompleted && updatedTask.status === 'completed') {
                        this.selectedTaskId = this.selectedTaskId === task.id ? null : this.selectedTaskId;
                    }
                    this.renderTaskList(api, list, listArea, detail);
                } catch (error) {
                    checkbox.checked = task.status === 'completed';
                    new Notice('Failed to update task');
                    console.error(error);
                }
            })();
        };

        const content = row.createDiv({ cls: 'todo-task-card-content' });
        const titleLine = content.createDiv({ cls: 'todo-task-title-line' });
        titleLine.createSpan({ text: task.title, cls: 'todo-task-title' });
        if (task.importance === 'high') titleLine.createSpan({ text: '★', cls: 'todo-star is-important' });

        const meta = buildTaskMeta(task);
        if (meta) content.createDiv({ text: meta, cls: 'todo-task-meta' });

        const body = stripHtml(task.body?.content || '').trim();
        if (body) content.createDiv({ text: body, cls: 'todo-task-preview' });

        if (task.checklistItems && task.checklistItems.length > 0) {
            content.createDiv({ text: `${task.checklistItems.filter(item => item.isChecked).length}/${task.checklistItems.length} steps`, cls: 'todo-task-meta' });
        }

        row.onclick = () => this.selectTask(api, list, listArea, detail, task);
    }

    selectTask(api: MsTodoApi, list: TodoList, listArea: HTMLElement, detail: HTMLElement, task: TodoTask) {
        this.selectedTaskId = task.id;
        listArea.querySelectorAll('.todo-task-card').forEach((row) => {
            row.toggleClass('is-selected', row.getAttr('data-task-id') === task.id);
        });
        this.renderTaskDetail(api, detail, listArea, list, task);
    }

    renderTaskDetail(api: MsTodoApi, detail: HTMLElement, listArea: HTMLElement, list: TodoList, task: TodoTask) {
        detail.empty();
        detail.addClass('is-open');
        const closeBtn = detail.createEl('button', { text: 'Close details', cls: 'todo-detail-close' });
        closeBtn.onclick = () => {
            this.selectedTaskId = null;
            detail.empty();
            detail.removeClass('is-open');
            listArea.querySelectorAll('.todo-task-card').forEach((row) => row.removeClass('is-selected'));
        };

        const header = detail.createDiv({ cls: 'todo-detail-header' });
        const complete = header.createEl('input', { type: 'checkbox' });
        complete.checked = task.status === 'completed';
        complete.onchange = () => {
            void (async () => {
                try {
                    const updatedTask = task.status === 'completed'
                        ? await api.reopenTask(list.id, task.id)
                        : await api.completeTask(list.id, task.id);
                    this.replaceTask(updatedTask);
                    if (!this.showCompleted && updatedTask.status === 'completed') this.selectedTaskId = null;
                    this.renderTaskList(api, list, listArea, detail);
                } catch (error) {
                    complete.checked = task.status === 'completed';
                    new Notice('Failed to update task');
                    console.error(error);
                }
            })();
        };

        const titleInput = header.createEl('textarea', { cls: 'todo-title-input' });
        titleInput.value = task.title;
        titleInput.rows = 2;
        titleInput.onblur = () => {
            const nextTitle = titleInput.value.trim();
            if (!nextTitle || nextTitle === task.title) return;
            void this.saveTaskChange(api, list, listArea, detail, task, () => api.updateTask(list.id, task.id, { title: nextTitle }), 'Title updated');
        };

        const starBtn = header.createEl('button', { text: task.importance === 'high' ? '★' : '☆', cls: 'todo-star-button' });
        if (task.importance === 'high') starBtn.addClass('is-important');
        starBtn.onclick = () => {
            void this.saveTaskChange(api, list, listArea, detail, task, () => api.toggleImportant(list.id, task), task.importance === 'high' ? 'Removed from important' : 'Marked as important');
        };

        const dateCard = detail.createDiv({ cls: 'todo-detail-card' });
        dateCard.createEl('label', { text: 'Due date' });
        const dateInput = dateCard.createEl('input', { type: 'date' });
        dateInput.value = dateToInputValue(task.dueDateTime?.dateTime || '');
        dateInput.onchange = () => {
            void this.saveTaskChange(api, list, listArea, detail, task, () => api.updateTaskDueDate(list.id, task.id, dateInput.value), dateInput.value ? 'Due date updated' : 'Due date cleared');
        };
        if (task.dueDateTime?.dateTime) {
            const clearDate = dateCard.createEl('button', { text: 'Clear due date', cls: 'todo-link-button' });
            clearDate.onclick = () => {
                void this.saveTaskChange(api, list, listArea, detail, task, () => api.updateTaskDueDate(list.id, task.id, ''), 'Due date cleared');
            };
        }

        const noteCard = detail.createDiv({ cls: 'todo-detail-card' });
        noteCard.createEl('label', { text: 'Notes' });
        const noteInput = noteCard.createEl('textarea', { cls: 'todo-note-input', placeholder: 'Add notes' });
        noteInput.value = stripHtml(task.body?.content || '');
        noteInput.rows = 8;
        const saveNote = noteCard.createEl('button', { text: 'Save note', cls: 'todo-primary-button' });
        saveNote.onclick = () => {
            void this.saveTaskChange(api, list, listArea, detail, task, () => api.updateTaskBody(list.id, task.id, noteInput.value), 'Note updated');
        };

        if (task.checklistItems && task.checklistItems.length > 0) {
            const stepsCard = detail.createDiv({ cls: 'todo-detail-card' });
            stepsCard.createEl('label', { text: 'Steps' });
            task.checklistItems.forEach((step) => {
                const row = stepsCard.createDiv({ cls: 'todo-step-row' });
                const checked = row.createEl('input', { type: 'checkbox' });
                checked.checked = step.isChecked;
                checked.disabled = true;
                row.createSpan({ text: step.displayName });
            });
        }

        const footer = detail.createDiv({ cls: 'todo-detail-footer' });
        if (task.createdDateTime) footer.createSpan({ text: `Created ${formatDisplayDate(task.createdDateTime)}` });
        if (task.completedDateTime?.dateTime) footer.createSpan({ text: `Completed ${formatDisplayDate(task.completedDateTime.dateTime)}` });
    }

    async saveTaskChange(api: MsTodoApi, list: TodoList, listArea: HTMLElement, detail: HTMLElement, task: TodoTask, update: () => Promise<TodoTask>, successMessage: string) {
        try {
            const updatedTask = await update();
            this.replaceTask(updatedTask);
            this.selectedTaskId = updatedTask.id || task.id;
            new Notice(successMessage);
            this.renderTaskList(api, list, listArea, detail);
        } catch (error) {
            new Notice('Failed to update task');
            console.error(error);
        }
    }

    replaceTask(updatedTask: TodoTask) {
        this.currentTasks = this.currentTasks.map((task) => task.id === updatedTask.id ? updatedTask : task);
    }
}

function buildTaskMeta(task: TodoTask): string {
    const meta: string[] = [];
    if (task.dueDateTime?.dateTime) meta.push(`Due ${formatDisplayDate(task.dueDateTime.dateTime)}`);
    if (task.status === 'completed') meta.push('Completed');
    return meta.join(' · ');
}

function dateToInputValue(value: string): string {
    if (!value) return '';
    return value.includes('T') ? (value.split('T')[0] || '') : value;
}

function formatDisplayDate(value: string): string {
    const date = dateToInputValue(value);
    if (!date) return value;
    const parts = date.split('-');
    if (parts.length !== 3) return date;
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function stripHtml(value: string): string {
    return value
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p>\s*<p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
