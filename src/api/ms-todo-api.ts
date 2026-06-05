import { Notice, requestUrl } from 'obsidian';
import { AuthManager } from '../auth';
import type MsTodoPlugin from '../main';
import { buildMarkdownDocument } from '../sync/markdown';
import { graphErrorMessage, requestGraphUrlWithRetry } from './graph-request';

const GRAPH_ENDPOINT = 'https://graph.microsoft.com/v1.0';

export interface TodoList {
    id: string;
    displayName: string;
    wellknownListName?: string;
}

export interface ChecklistItem {
    id: string;
    displayName: string;
    isChecked: boolean;
}

export interface LinkedResource {
    id: string;
    displayName?: string;
    webUrl?: string;
    applicationName?: string;
}

export interface TodoDateTime {
    dateTime: string;
    timeZone: string;
}

export interface TodoTask {
    id: string;
    title: string;
    status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred';
    body?: {
        content?: string;
        contentType?: string;
    };
    dueDateTime?: TodoDateTime;
    reminderDateTime?: TodoDateTime;
    importance?: 'low' | 'normal' | 'high';
    isReminderOn?: boolean;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    completedDateTime?: TodoDateTime;
    checklistItems?: ChecklistItem[];
    linkedResources?: LinkedResource[];
}

export interface UpdateTaskPayload {
    title?: string;
    status?: TodoTask['status'];
    body?: {
        content: string;
        contentType: 'text' | 'html';
    };
    dueDateTime?: TodoDateTime | null;
    importance?: TodoTask['importance'];
}

interface GraphCollection<T> {
    value: T[];
    '@odata.nextLink'?: string;
}

export class MsTodoApi {
    plugin: MsTodoPlugin;
    auth: AuthManager;

    constructor(plugin: MsTodoPlugin) {
        this.plugin = plugin;
        this.auth = new AuthManager();
    }

    async getValidToken(): Promise<string> {
        const now = Date.now();
        if (this.plugin.settings.tokenExpiresAt - now < 5 * 60 * 1000) {
            if (this.plugin.settings.refreshToken) {
                try {
                    console.warn('Token is expiring, refreshing...');
                    const newTokens = await this.auth.refreshAccessToken(this.plugin.settings.refreshToken);
                    await this.plugin.saveTokens(newTokens);
                    return newTokens.access_token;
                } catch (error) {
                    new Notice('Sign in expired. Please sign in again.');
                    throw error;
                }
            } else {
                throw new Error('No sign-in information found');
            }
        }
        return this.plugin.settings.accessToken;
    }

    async request<T>(url: string, method: string = 'GET', body?: Record<string, unknown>): Promise<T> {
        const token = await this.getValidToken();
        const response = await requestGraphUrlWithRetry({
            url,
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        }, requestUrl);

        if (method === 'DELETE' || response.status === 204) {
            return undefined as T;
        }

        if (response.status >= 400) {
            throw new Error(graphErrorMessage(response));
        }

        return response.json as T;
    }

    async getCollection<T>(url: string): Promise<T[]> {
        const items: T[] = [];
        let nextUrl: string | undefined = url;

        while (nextUrl) {
            const page: GraphCollection<T> = await this.request<GraphCollection<T>>(nextUrl);
            items.push(...page.value);
            nextUrl = page['@odata.nextLink'];
        }

        return items;
    }

    async getTaskLists(): Promise<TodoList[]> {
        const lists = await this.getCollection<TodoList>(`${GRAPH_ENDPOINT}/me/todo/lists`);
        return lists.filter((list) => list.wellknownListName !== 'flaggedEmails');
    }

    async getTasks(listId: string, includeCompleted: boolean = false): Promise<TodoTask[]> {
        const filter = includeCompleted ? '' : '&$filter=status ne \'completed\'';
        const url = `${GRAPH_ENDPOINT}/me/todo/lists/${listId}/tasks?$top=100&$expand=checklistItems,linkedResources${filter}`;
        return this.getCollection<TodoTask>(url);
    }

    async createTaskList(displayName: string): Promise<TodoList> {
        return this.request<TodoList>(`${GRAPH_ENDPOINT}/me/todo/lists`, 'POST', { displayName });
    }

    async deleteTaskList(listId: string): Promise<void> {
        await this.request<void>(`${GRAPH_ENDPOINT}/me/todo/lists/${listId}`, 'DELETE');
    }

    async createTask(listId: string, title: string): Promise<TodoTask> {
        return this.request<TodoTask>(`${GRAPH_ENDPOINT}/me/todo/lists/${listId}/tasks`, 'POST', { title });
    }

    async updateTask(listId: string, taskId: string, payload: UpdateTaskPayload): Promise<TodoTask> {
        return this.request<TodoTask>(`${GRAPH_ENDPOINT}/me/todo/lists/${listId}/tasks/${taskId}`, 'PATCH', payload as Record<string, unknown>);
    }

    async completeTask(listId: string, taskId: string): Promise<TodoTask> {
        return this.updateTask(listId, taskId, { status: 'completed' });
    }

    async reopenTask(listId: string, taskId: string): Promise<TodoTask> {
        return this.updateTask(listId, taskId, { status: 'notStarted' });
    }

    async updateTaskBody(listId: string, taskId: string, content: string): Promise<TodoTask> {
        return this.updateTask(listId, taskId, { body: { content, contentType: 'text' } });
    }

    async updateTaskDueDate(listId: string, taskId: string, date: string): Promise<TodoTask> {
        const dueDateTime = date ? { dateTime: `${date}T00:00:00`, timeZone: 'UTC' } : null;
        return this.updateTask(listId, taskId, { dueDateTime });
    }

    async toggleImportant(listId: string, task: TodoTask): Promise<TodoTask> {
        return this.updateTask(listId, task.id, { importance: task.importance === 'high' ? 'normal' : 'high' });
    }

    async syncAllTasksToMarkdown(): Promise<{ path: string; listCount: number; taskCount: number }> {
        const lists = await this.getTaskLists();
        const listsWithTasks: Array<{ list: TodoList; tasks: TodoTask[] }> = [];
        for (const list of lists) {
            listsWithTasks.push({
                list,
                tasks: await this.getTasks(list.id, true),
            });
        }
        const markdown = buildMarkdownDocument(listsWithTasks);
        await this.plugin.app.vault.adapter.write(this.plugin.settings.markdownSyncPath, markdown);
        const taskCount = listsWithTasks.reduce((sum, item) => sum + item.tasks.length, 0);
        return { path: this.plugin.settings.markdownSyncPath, listCount: lists.length, taskCount };
    }
}
