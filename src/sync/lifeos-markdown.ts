import type { TodoList, TodoTask } from '../api/ms-todo-api';

export interface LifeOsTodoListMapping {
	listId: string;
	listName: string;
	projectTag: string;
	projectNotePath: string;
	includeInDaily: boolean;
}

export interface LifeOsTodoListWithTasks {
	list: TodoList;
	tasks: TodoTask[];
}

export interface LifeOsTodoTaskItem {
	list: TodoList;
	task: TodoTask;
	targetPath: string;
	blockId: string;
	projectTag: string;
	includeInDaily: boolean;
}

export interface LifeOsProjectTarget {
	path: string;
	tasks: LifeOsTodoTaskItem[];
}

export interface LifeOsSyncModel {
	projectTargets: LifeOsProjectTarget[];
	unmappedTarget: LifeOsProjectTarget;
	todayTasks: LifeOsTodoTaskItem[];
	listCount: number;
	taskCount: number;
	unmappedListNames: string[];
}

export interface LifeOsSyncModelOptions {
	unmappedInboxPath?: string;
	projectNotePathPattern?: string;
}

export interface LifeOsMarkdownRenderOptions {
	projectTodoHeading?: string;
	projectInsertBeforeHeading?: string;
	dailyTaskHeading?: string;
}

export interface LifeOsProjectTemplateContext {
	projectTag: string;
	listName: string;
	projectNotePath: string;
	date: Date;
}

const DEFAULT_INBOX_PATH = 'Microsoft To Do.md';
export const DEFAULT_PROJECT_NOTE_PATH_PATTERN = '1. 项目/{{AREA}}-{{PROJECT}}/{{PROJECT}}.README.md';
export const DEFAULT_PROJECT_TODO_HEADING = '## Microsoft To Do';
export const DEFAULT_PROJECT_INSERT_BEFORE_HEADING = '## LifeOS';
export const DEFAULT_DAILY_TASK_HEADING = '### 任务';
const PROJECT_BLOCK_START = '<!-- mstodo:project:start -->';
const PROJECT_BLOCK_END = '<!-- mstodo:project:end -->';
const TODAY_BLOCK_START = '<!-- mstodo:today:start -->';
const TODAY_BLOCK_END = '<!-- mstodo:today:end -->';

export function buildLifeOsSyncModel(
	listsWithTasks: LifeOsTodoListWithTasks[],
	mappings: LifeOsTodoListMapping[],
	today: Date,
	options: LifeOsSyncModelOptions = {},
): LifeOsSyncModel {
	const inboxPath = normalizeVaultPath(options.unmappedInboxPath || DEFAULT_INBOX_PATH);
	const mappingsByListId = new Map(mappings.map((mapping) => [mapping.listId, mapping]));
	const projectTargetsByPath = new Map<string, LifeOsProjectTarget>();
	const unmappedTasks: LifeOsTodoTaskItem[] = [];
	const todayTasks: LifeOsTodoTaskItem[] = [];
	const unmappedListNames = new Set<string>();
	let taskCount = 0;

	for (const { list, tasks } of listsWithTasks) {
		const mapping = mappingsByListId.get(list.id);
		const projectTag = normalizeTag(mapping?.projectTag || '');
		const projectPath = normalizeVaultPath(
			mapping?.projectNotePath || defaultProjectNotePathFromTag(projectTag, options.projectNotePathPattern),
		);
		const isMapped = Boolean(projectTag && projectPath);

		for (const task of tasks) {
			taskCount += 1;
			const item: LifeOsTodoTaskItem = {
				list,
				task,
				targetPath: isMapped ? projectPath : inboxPath,
				blockId: buildTaskBlockId(list.id, task.id),
				projectTag: isMapped ? projectTag : '',
				includeInDaily: Boolean(mapping?.includeInDaily),
			};

			if (isMapped) {
				const target = projectTargetsByPath.get(item.targetPath) || { path: item.targetPath, tasks: [] };
				target.tasks.push(item);
				projectTargetsByPath.set(item.targetPath, target);
			} else {
				unmappedTasks.push(item);
				unmappedListNames.add(list.displayName);
			}

			if (shouldShowInToday(item, today)) {
				todayTasks.push(item);
			}
		}
	}

	return {
		projectTargets: [...projectTargetsByPath.values()],
		unmappedTarget: { path: inboxPath, tasks: unmappedTasks },
		todayTasks,
		listCount: listsWithTasks.length,
		taskCount,
		unmappedListNames: [...unmappedListNames],
	};
}

export function renderProjectTodoSection(
	tasks: LifeOsTodoTaskItem[],
	syncedAt: string,
	options: LifeOsMarkdownRenderOptions = {},
): string {
	const heading = normalizeHeading(options.projectTodoHeading, DEFAULT_PROJECT_TODO_HEADING);
	const lines = [
		heading,
		'',
		PROJECT_BLOCK_START,
		`Synced at ${syncedAt}. Edit tasks in Microsoft To Do; this block is overwritten by sync.`,
		'',
	];

	if (tasks.length === 0) {
		lines.push('_No Microsoft To Do tasks._');
	} else {
		for (const item of tasks) {
			appendProjectTask(lines, item);
		}
	}

	lines.push(PROJECT_BLOCK_END);
	return `${lines.join('\n').trimEnd()}\n`;
}

export function renderDailyTodoBlock(tasks: LifeOsTodoTaskItem[], syncedAt: string): string {
	const lines = [
		TODAY_BLOCK_START,
		`Synced at ${syncedAt}. Microsoft To Do is the source of truth.`,
		'',
	];

	if (tasks.length === 0) {
		lines.push('_No Microsoft To Do items for today._');
	} else {
		for (const item of tasks) {
			const meta = buildDailyMeta(item);
			lines.push(`- ${buildTaskWikiLink(item)}${meta ? ` · ${meta}` : ''}`);
		}
	}

	lines.push(TODAY_BLOCK_END);
	return `${lines.join('\n').trimEnd()}\n`;
}

export function upsertProjectTodoSection(
	content: string,
	section: string,
	options: LifeOsMarkdownRenderOptions = {},
): string {
	const normalizedContent = normalizeEol(content);
	const normalizedSection = `${normalizeEol(section).trimEnd()}\n`;
	const projectHeading = normalizeHeading(options.projectTodoHeading, DEFAULT_PROJECT_TODO_HEADING);
	const insertBeforeHeading = normalizeOptionalHeading(options.projectInsertBeforeHeading, DEFAULT_PROJECT_INSERT_BEFORE_HEADING);
	const existing = findTopLevelSection(normalizedContent, projectHeading);

	if (existing) {
		return joinWithSingleTrailingNewline(
			`${normalizedContent.slice(0, existing.start).trimEnd()}\n\n${normalizedSection}${normalizedContent.slice(existing.end).replace(/^\n+/, '\n')}`,
		);
	}

	const insertBefore = findExactHeading(normalizedContent, insertBeforeHeading);
	if (insertBefore?.index !== undefined) {
		return joinWithSingleTrailingNewline(
			`${normalizedContent.slice(0, insertBefore.index).trimEnd()}\n\n${normalizedSection}\n${normalizedContent.slice(insertBefore.index).trimStart()}`,
		);
	}

	return joinWithSingleTrailingNewline(`${normalizedContent.trimEnd()}\n\n${normalizedSection}`);
}

export function upsertDailyTodoBlock(
	content: string,
	block: string,
	options: LifeOsMarkdownRenderOptions = {},
): string {
	const normalizedContent = normalizeEol(content);
	const normalizedBlock = `${normalizeEol(block).trimEnd()}\n`;
	const replaced = replaceControlledBlock(normalizedContent, TODAY_BLOCK_START, TODAY_BLOCK_END, normalizedBlock);
	if (replaced) return joinWithSingleTrailingNewline(replaced);

	const dailyTaskHeading = normalizeHeading(options.dailyTaskHeading, DEFAULT_DAILY_TASK_HEADING);
	const heading = findExactHeading(normalizedContent, dailyTaskHeading);
	if (heading?.index !== undefined) {
		const insertAt = heading.index + heading[0].length;
		return joinWithSingleTrailingNewline(
			`${normalizedContent.slice(0, insertAt).trimEnd()}\n${normalizedBlock}${normalizedContent.slice(insertAt).replace(/^\n+/, '\n')}`,
		);
	}

	return joinWithSingleTrailingNewline(`${normalizedContent.trimEnd()}\n\n${dailyTaskHeading}\n${normalizedBlock}`);
}

export function buildDailyNotePath(pattern: string, date: Date): string {
	const yyyy = String(date.getFullYear());
	const mm = pad2(date.getMonth() + 1);
	const dd = pad2(date.getDate());
	return normalizeVaultPath(pattern
		.replace(/\{\{YYYY-MM-DD\}\}/g, `${yyyy}-${mm}-${dd}`)
		.replace(/\{\{YYYY\}\}/g, yyyy)
		.replace(/\{\{MM\}\}/g, mm)
		.replace(/\{\{DD\}\}/g, dd));
}

export function isExpectedVaultName(actualVaultName: string, expectedVaultName: string): boolean {
	const expected = expectedVaultName.trim();
	return !expected || actualVaultName.trim() === expected;
}

export function defaultProjectNotePathFromTag(
	projectTag: string,
	pattern: string = DEFAULT_PROJECT_NOTE_PATH_PATTERN,
): string {
	const values = getProjectTagValues(projectTag);
	if (!values) return '';

	const pathPattern = normalizeVaultPath(pattern || DEFAULT_PROJECT_NOTE_PATH_PATTERN);
	return normalizeVaultPath(replaceProjectPlaceholders(pathPattern, {
		...values,
		listName: '',
		projectNotePath: '',
		date: new Date(),
	}));
}

export function renderProjectNoteTemplate(template: string, context: LifeOsProjectTemplateContext): string {
	const values = getProjectTagValues(context.projectTag);
	if (!values) return template;

	return replaceProjectPlaceholders(template, {
		...values,
		listName: context.listName,
		projectNotePath: context.projectNotePath,
		date: context.date,
	});
}

export function formatLocalDateTime(date: Date): string {
	return `${formatLocalDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function getProjectTagValues(projectTag: string) {
	const normalized = normalizeTag(projectTag);
	const parts = normalized.replace(/^#/, '').split('/').filter((part) => part.trim().length > 0);
	const area = sanitizePathSegment(parts[0] || '');
	const project = sanitizePathSegment(parts.slice(1).join('-'));
	if (!area || !project) return null;

	return {
		area,
		project,
		projectTag: normalized,
		projectTagPath: normalized.replace(/^#/, ''),
	};
}

function replaceProjectPlaceholders(
	value: string,
	context: {
		area: string;
		project: string;
		projectTag: string;
		projectTagPath: string;
		listName: string;
		projectNotePath: string;
		date: Date;
	},
): string {
	const yyyy = String(context.date.getFullYear());
	const mm = pad2(context.date.getMonth() + 1);
	const dd = pad2(context.date.getDate());
	return value
		.replace(/\{\{AREA\}\}/g, context.area)
		.replace(/\{\{PROJECT_AREA\}\}/g, context.area)
		.replace(/\{\{PROJECT\}\}/g, context.project)
		.replace(/\{\{PROJECT_TAG\}\}/g, context.projectTag)
		.replace(/\{\{PROJECT_TAG_PATH\}\}/g, context.projectTagPath)
		.replace(/\{\{LIST_NAME\}\}/g, context.listName)
		.replace(/\{\{PROJECT_NOTE_PATH\}\}/g, context.projectNotePath)
		.replace(/\{\{YYYY-MM-DD\}\}/g, `${yyyy}-${mm}-${dd}`)
		.replace(/\{\{YYYY\}\}/g, yyyy)
		.replace(/\{\{MM\}\}/g, mm)
		.replace(/\{\{DD\}\}/g, dd);
}

function appendProjectTask(lines: string[], item: LifeOsTodoTaskItem) {
	const { task } = item;
	const checked = task.status === 'completed' ? 'x' : ' ';
	const parts = [
		escapeInlineText(task.title),
		'#mstodo',
	];

	if (item.projectTag) parts.push(item.projectTag);
	parts.push(buildListTag(item.list));

	const priority = buildPriorityToken(task);
	if (priority) parts.push(priority);

	const dueDate = getTodoDate(task.dueDateTime?.dateTime);
	if (dueDate) parts.push(`📅 ${dueDate}`);

	const completedDate = getTodoDate(task.completedDateTime?.dateTime);
	if (completedDate) parts.push(`✅ ${completedDate}`);

	parts.push(`^${item.blockId}`);
	lines.push(`- [${checked}] ${parts.join(' ')}`);

	const body = htmlToPlainMarkdown(task.body?.content || '').trim();
	if (body) {
		const bodyLines = body.split('\n').filter((line) => line.trim().length > 0);
		const firstLine = bodyLines[0];
		if (firstLine) lines.push(`  - 备注: ${escapeInlineText(firstLine)}`);
		for (const line of bodyLines.slice(1)) {
			lines.push(`    ${escapeInlineText(line)}`);
		}
	}

	if (task.checklistItems && task.checklistItems.length > 0) {
		lines.push('  - 步骤:');
		for (const step of task.checklistItems) {
			lines.push(`    - ${step.isChecked ? 'DONE' : 'TODO'} ${escapeInlineText(step.displayName)}`);
		}
	}

	if (task.linkedResources && task.linkedResources.length > 0) {
		lines.push('  - 链接:');
		for (const resource of task.linkedResources) {
			const label = resource.displayName || resource.applicationName || resource.webUrl || 'Linked resource';
			lines.push(resource.webUrl
				? `    - ${escapeInlineText(label)}: ${resource.webUrl}`
				: `    - ${escapeInlineText(label)}`);
		}
	}
}

function shouldShowInToday(item: LifeOsTodoTaskItem, today: Date): boolean {
	const todayDate = formatLocalDate(today);
	const { task } = item;

	if (task.status === 'completed') {
		return getTodoDate(task.completedDateTime?.dateTime) === todayDate;
	}

	const dueDate = getTodoDate(task.dueDateTime?.dateTime);
	return Boolean(
		(dueDate && dueDate <= todayDate)
		|| task.status === 'inProgress'
		|| task.importance === 'high'
		|| item.includeInDaily,
	);
}

function buildDailyMeta(item: LifeOsTodoTaskItem): string {
	const meta: string[] = [];
	if (item.projectTag) meta.push(item.projectTag);
	meta.push(buildListTag(item.list));

	const dueDate = getTodoDate(item.task.dueDateTime?.dateTime);
	if (dueDate) meta.push(`due ${dueDate}`);

	if (item.task.status === 'completed') {
		const completedDate = getTodoDate(item.task.completedDateTime?.dateTime);
		meta.push(completedDate ? `completed ${completedDate}` : 'completed');
	}

	return meta.join(' · ');
}

function buildTaskWikiLink(item: LifeOsTodoTaskItem): string {
	const path = markdownPathToWikiPath(item.targetPath);
	const title = escapeWikiAlias(item.task.title);
	return `[[${path}#^${item.blockId}|${title}]]`;
}

function buildTaskBlockId(listId: string, taskId: string): string {
	return `mstodo-${slugForBlockId(listId)}-${slugForBlockId(taskId)}`;
}

function buildListTag(list: TodoList): string {
	return `#mstodo/list/${slugForTag(list.displayName || list.id)}`;
}

function buildPriorityToken(task: TodoTask): string {
	if (task.importance === 'high') return '⏫';
	if (task.importance === 'low') return '🔽';
	return '';
}

function replaceControlledBlock(content: string, startMarker: string, endMarker: string, block: string): string | null {
	const start = content.indexOf(startMarker);
	const end = content.indexOf(endMarker, start + startMarker.length);
	if (start === -1 || end === -1) return null;

	return `${content.slice(0, start).trimEnd()}\n${block.trimEnd()}\n${content.slice(end + endMarker.length).replace(/^\n+/, '\n')}`;
}

function findTopLevelSection(content: string, heading: string): { start: number; end: number } | null {
	const pattern = new RegExp(`^${escapeRegExp(heading)}\\s*$`, 'm');
	const match = pattern.exec(content);
	if (!match) return null;

	const start = match.index;
	const afterHeadingStart = start + match[0].length;
	const rest = content.slice(afterHeadingStart);
	const nextHeading = /^## .+$/m.exec(rest);
	const end = nextHeading ? afterHeadingStart + nextHeading.index : content.length;
	return { start, end };
}

function findExactHeading(content: string, heading: string): RegExpExecArray | null {
	const normalized = normalizeHeading(heading, '');
	if (!normalized) return null;
	const pattern = new RegExp(`^${escapeRegExp(normalized)}\\s*$`, 'm');
	return pattern.exec(content);
}

function htmlToPlainMarkdown(value: string): string {
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
		.map((line) => line.trimEnd())
		.join('\n')
		.trim();
}

function normalizeVaultPath(path: string): string {
	return path.trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function normalizeHeading(value: string | undefined, fallback: string): string {
	return (value || fallback).trim() || fallback;
}

function normalizeOptionalHeading(value: string | undefined, fallback: string): string {
	return value === undefined ? fallback : value.trim();
}

function normalizeTag(tag: string): string {
	const normalized = tag.trim().replace(/\s+/g, '');
	if (!normalized) return '';
	return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

function sanitizePathSegment(value: string): string {
	return value.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function slugForTag(value: string): string {
	return value
		.trim()
		.replace(/^#+/, '')
		.replace(/[\\/#?^[\]|:*"<>]/g, '-')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '') || 'list';
}

function slugForBlockId(value: string): string {
	return value
		.trim()
		.replace(/[^A-Za-z0-9_-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '') || 'id';
}

function markdownPathToWikiPath(path: string): string {
	return normalizeVaultPath(path).replace(/\.md$/i, '');
}

function escapeInlineText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function escapeWikiAlias(value: string): string {
	return escapeInlineText(value).replace(/\|/g, '/');
}

function getTodoDate(value?: string): string {
	if (!value) return '';
	return value.includes('T') ? value.split('T')[0] || '' : value;
}

function formatLocalDate(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

function normalizeEol(value: string): string {
	return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function joinWithSingleTrailingNewline(value: string): string {
	return `${value.replace(/\n+$/g, '')}\n`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
