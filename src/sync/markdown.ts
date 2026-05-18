import type { TodoList, TodoTask } from '../api/ms-todo-api';

interface ListWithTasks {
    list: TodoList;
    tasks: TodoTask[];
}

export function buildMarkdownDocument(listsWithTasks: ListWithTasks[]): string {
    const lines: string[] = [
        '# Microsoft To Do',
        '',
        `> Synced at ${new Date().toLocaleString()}. Edit tasks in Microsoft To Do, then sync again.`,
        '',
    ];

    listsWithTasks.forEach(({ list, tasks }) => {
        lines.push(`## ${escapeMarkdown(list.displayName)}`, '');

        if (tasks.length === 0) {
            lines.push('_No tasks._', '');
            return;
        }

        tasks.forEach((task) => appendTask(lines, task));
        lines.push('');
    });

    return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function appendTask(lines: string[], task: TodoTask) {
    const checked = task.status === 'completed' ? 'x' : ' ';
    const metadata = buildMetadata(task);
    lines.push(`- [${checked}] ${escapeMarkdown(task.title)}${metadata ? ` ${metadata}` : ''}`);

    const body = htmlToMarkdown(task.body?.content || '').trim();
    if (body) {
        body.split('\n').forEach((line) => {
            lines.push(`  > ${line || ' '}`);
        });
    }

    if (task.checklistItems && task.checklistItems.length > 0) {
        task.checklistItems.forEach((item) => {
            lines.push(`  - [${item.isChecked ? 'x' : ' '}] ${escapeMarkdown(item.displayName)}`);
        });
    }

    if (task.linkedResources && task.linkedResources.length > 0) {
        task.linkedResources.forEach((resource) => {
            const label = resource.displayName || resource.applicationName || resource.webUrl || 'Linked resource';
            if (resource.webUrl) {
                lines.push(`  - ${escapeMarkdown(label)}: ${resource.webUrl}`);
            } else {
                lines.push(`  - ${escapeMarkdown(label)}`);
            }
        });
    }
}

function buildMetadata(task: TodoTask): string {
    const metadata: string[] = [];
    if (task.importance === 'high') metadata.push('🔴 high');
    if (task.dueDateTime?.dateTime) metadata.push(`due: ${formatDate(task.dueDateTime.dateTime)}`);
    if (task.reminderDateTime?.dateTime) metadata.push(`reminder: ${formatDate(task.reminderDateTime.dateTime)}`);
    return metadata.length > 0 ? `(${metadata.join(', ')})` : '';
}

function formatDate(value: string): string {
    return value.includes('T') ? (value.split('T')[0] || value) : value;
}

function htmlToMarkdown(value: string): string {
    return value
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p>\s*<p>/gi, '\n\n')
        .replace(/<\/div>\s*<div>/gi, '\n')
        .replace(/<\/?p[^>]*>/gi, '')
        .replace(/<\/?div[^>]*>/gi, '')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/?ul[^>]*>/gi, '')
        .replace(/<\/?ol[^>]*>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .trim();
}

function escapeMarkdown(value: string): string {
    return value.replace(/\n/g, ' ').trim();
}
