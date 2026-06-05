import type MsTodoPlugin from '../main';
import { MsTodoApi } from '../api/ms-todo-api';
import {
	buildDailyNotePath,
	buildLifeOsSyncModel,
	formatLocalDateTime,
	isExpectedVaultName,
	renderDailyTodoBlock,
	renderProjectNoteTemplate,
	renderProjectTodoSection,
	upsertDailyTodoBlock,
	upsertProjectTodoSection,
	type LifeOsMarkdownRenderOptions,
	type LifeOsTodoTaskItem,
	type LifeOsProjectTarget,
} from './lifeos-markdown';

export interface LifeOsSyncResult {
	skipped: boolean;
	reason?: string;
	listCount: number;
	taskCount: number;
	projectFileCount: number;
	inboxTaskCount: number;
	dailyTaskCount: number;
	unmappedListNames: string[];
	missingProjectPaths: string[];
	dailyNotePath: string;
	inboxPath: string;
}

export class LifeOsSyncService {
	private plugin: MsTodoPlugin;
	private api: MsTodoApi;

	constructor(plugin: MsTodoPlugin, api: MsTodoApi = new MsTodoApi(plugin)) {
		this.plugin = plugin;
		this.api = api;
	}

	async sync(now: Date = new Date()): Promise<LifeOsSyncResult> {
		const settings = this.plugin.settings;
		const vaultName = this.plugin.app.vault.getName();
		const inboxPath = normalizeVaultPath(settings.unmappedInboxPath);
		const dailyNotePath = buildDailyNotePath(settings.dailyNotePathPattern, now);

		if (!isExpectedVaultName(vaultName, settings.expectedVaultName)) {
			return {
				skipped: true,
				reason: `Current vault "${vaultName}" does not match "${settings.expectedVaultName}"`,
				listCount: 0,
				taskCount: 0,
				projectFileCount: 0,
				inboxTaskCount: 0,
				dailyTaskCount: 0,
				unmappedListNames: [],
				missingProjectPaths: [],
				dailyNotePath,
				inboxPath,
			};
		}

		const lists = await this.api.getTaskLists();
		const listsWithTasks = [];
		for (const list of lists) {
			listsWithTasks.push({
				list,
				tasks: await this.api.getTasks(list.id, true),
			});
		}
		const markdownOptions = this.buildMarkdownOptions();
		const model = buildLifeOsSyncModel(listsWithTasks, settings.todoListMappings, now, {
			unmappedInboxPath: inboxPath,
			projectNotePathPattern: settings.projectNotePathPattern,
		});
		const syncedAt = formatLocalDateTime(now);
		const missingProjectPaths: string[] = [];
		const missingProjectTasks: LifeOsTodoTaskItem[] = [];
		let projectFileCount = 0;

		for (const target of model.projectTargets) {
			if (!await this.exists(target.path)) {
				if (!settings.createMissingProjectNotes) {
					missingProjectPaths.push(target.path);
					missingProjectTasks.push(...target.tasks.map((item) => ({ ...item, targetPath: inboxPath })));
					continue;
				}

				const template = await this.readProjectTemplate(target, now);
				const section = renderProjectTodoSection(target.tasks, syncedAt, markdownOptions);
				await this.writeIfChanged(target.path, upsertProjectTodoSection(template, section, markdownOptions));
				projectFileCount += 1;
				continue;
			}

			const current = await this.read(target.path);
			const section = renderProjectTodoSection(target.tasks, syncedAt, markdownOptions);
			await this.writeIfChanged(target.path, upsertProjectTodoSection(current, section, markdownOptions));
			projectFileCount += 1;
		}

		const inboxTasks = [
			...model.unmappedTarget.tasks,
			...missingProjectTasks,
		];
		if (inboxTasks.length > 0 || await this.exists(inboxPath)) {
			const current = await this.exists(inboxPath) ? await this.read(inboxPath) : '# Microsoft To Do Inbox\n\n';
			const section = renderProjectTodoSection(inboxTasks, syncedAt, markdownOptions);
			await this.writeIfChanged(inboxPath, upsertProjectTodoSection(current, section, markdownOptions));
		}

		const dailyTasks = model.todayTasks.map((item) => missingProjectPaths.includes(item.targetPath)
			? { ...item, targetPath: inboxPath }
			: item);
		const dailyContent = await this.readOrCreateDailyNote(dailyNotePath);
		await this.writeIfChanged(
			dailyNotePath,
			upsertDailyTodoBlock(dailyContent, renderDailyTodoBlock(dailyTasks, syncedAt), markdownOptions),
		);

		return {
			skipped: false,
			listCount: model.listCount,
			taskCount: model.taskCount,
			projectFileCount,
			inboxTaskCount: inboxTasks.length,
			dailyTaskCount: dailyTasks.length,
			unmappedListNames: model.unmappedListNames,
			missingProjectPaths,
			dailyNotePath,
			inboxPath,
		};
	}

	private async readOrCreateDailyNote(path: string): Promise<string> {
		if (await this.exists(path)) return this.read(path);

		const templatePath = normalizeVaultPath(this.plugin.settings.dailyTemplatePath);
		const template = await this.exists(templatePath)
			? await this.read(templatePath)
			: '## 日常记录\n\n### 任务\n\n### 记录\n';
		await this.ensureParentFolder(path);
		await this.plugin.app.vault.adapter.write(path, template);
		return template;
	}

	private async readProjectTemplate(target: LifeOsProjectTarget, now: Date): Promise<string> {
		const firstTask = target.tasks[0];
		const templatePath = normalizeVaultPath(this.plugin.settings.projectTemplatePath);
		const template = templatePath && await this.exists(templatePath)
			? await this.read(templatePath)
			: '# {{PROJECT}}\n\n## LifeOS\n';

		return renderProjectNoteTemplate(template, {
			projectTag: firstTask?.projectTag || '',
			listName: firstTask?.list.displayName || '',
			projectNotePath: target.path,
			date: now,
		});
	}

	private buildMarkdownOptions(): LifeOsMarkdownRenderOptions {
		return {
			projectTodoHeading: this.plugin.settings.projectTodoHeading,
			projectInsertBeforeHeading: this.plugin.settings.projectInsertBeforeHeading,
			dailyTaskHeading: this.plugin.settings.dailyTaskHeading,
		};
	}

	private async writeIfChanged(path: string, content: string): Promise<void> {
		await this.ensureParentFolder(path);
		if (await this.exists(path)) {
			const current = await this.read(path);
			if (current === content) return;
		}
		await this.plugin.app.vault.adapter.write(path, content);
	}

	private async read(path: string): Promise<string> {
		return this.plugin.app.vault.adapter.read(normalizeVaultPath(path));
	}

	private async exists(path: string): Promise<boolean> {
		return this.plugin.app.vault.adapter.exists(normalizeVaultPath(path));
	}

	private async ensureParentFolder(path: string): Promise<void> {
		const normalized = normalizeVaultPath(path);
		const slashIndex = normalized.lastIndexOf('/');
		if (slashIndex === -1) return;

		const folder = normalized.slice(0, slashIndex);
		const parts = folder.split('/').filter((part) => part.length > 0);
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!await this.plugin.app.vault.adapter.exists(current)) {
				await this.plugin.app.vault.adapter.mkdir(current);
			}
		}
	}
}

function normalizeVaultPath(path: string): string {
	return path.trim().replace(/\\/g, '/').replace(/^\/+/, '');
}
