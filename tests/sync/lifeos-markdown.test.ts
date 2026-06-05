import test from 'node:test';
import assert from 'node:assert/strict';
import {
	buildDailyNotePath,
	buildLifeOsSyncModel,
	defaultProjectNotePathFromTag,
	isExpectedVaultName,
	renderDailyTodoBlock,
	renderProjectNoteTemplate,
	renderProjectTodoSection,
	upsertDailyTodoBlock,
	upsertProjectTodoSection,
	type LifeOsTodoListWithTasks,
	type LifeOsTodoListMapping,
} from '../../src/sync/lifeos-markdown';

const mappings: LifeOsTodoListMapping[] = [
	{
		listId: 'list-1',
		listName: 'Research',
		projectTag: '#科学研究/DualBasic',
		projectNotePath: '1. 项目/科学研究-DualBasic/DualBasic.README.md',
		includeInDaily: true,
	},
];

const listsWithTasks: LifeOsTodoListWithTasks[] = [
	{
		list: { id: 'list-1', displayName: 'Research' },
		tasks: [
			{
				id: 'task-1',
				title: '写实验设计',
				status: 'notStarted',
				importance: 'high',
				dueDateTime: { dateTime: '2026-06-05T00:00:00', timeZone: 'UTC' },
				body: { content: '第一行<br>第二行', contentType: 'html' },
				checklistItems: [
					{ id: 'step-1', displayName: '定变量', isChecked: true },
					{ id: 'step-2', displayName: '写假设', isChecked: false },
				],
			},
			{
				id: 'task-done',
				title: '今天完成的同步验证',
				status: 'completed',
				completedDateTime: { dateTime: '2026-06-05T09:00:00', timeZone: 'UTC' },
			},
		],
	},
	{
		list: { id: 'list-2', displayName: 'Inbox List' },
		tasks: [
			{
				id: 'task-2',
				title: '未映射任务',
				status: 'inProgress',
			},
		],
	},
];

test('buildLifeOsSyncModel groups mapped tasks, unmapped tasks, and approximate today tasks', () => {
	const model = buildLifeOsSyncModel(listsWithTasks, mappings, new Date('2026-06-05T12:00:00+08:00'));

	assert.equal(model.projectTargets.length, 1);
	assert.equal(model.projectTargets[0]?.path, '1. 项目/科学研究-DualBasic/DualBasic.README.md');
	assert.equal(model.projectTargets[0]?.tasks.length, 2);
	assert.equal(model.unmappedTarget.tasks.length, 1);
	assert.equal(model.unmappedTarget.path, 'Microsoft To Do.md');
	assert.deepEqual(model.todayTasks.map((item) => item.task.id), ['task-1', 'task-done', 'task-2']);
});

test('buildLifeOsSyncModel derives the default project README path from project tag', () => {
	const model = buildLifeOsSyncModel(listsWithTasks, [{
		listId: 'list-1',
		listName: 'Research',
		projectTag: '#科学研究/DualBasic',
		projectNotePath: '',
		includeInDaily: true,
	}], new Date('2026-06-05T12:00:00+08:00'));

	assert.equal(model.projectTargets.length, 1);
	assert.equal(model.projectTargets[0]?.path, '1. 项目/科学研究-DualBasic/DualBasic.README.md');
	assert.equal(model.todayTasks[0]?.targetPath, '1. 项目/科学研究-DualBasic/DualBasic.README.md');
});

test('buildLifeOsSyncModel can derive project README paths from a configurable pattern', () => {
	const model = buildLifeOsSyncModel(listsWithTasks, [{
		listId: 'list-1',
		listName: 'Research',
		projectTag: '#科学研究/DualBasic',
		projectNotePath: '',
		includeInDaily: true,
	}], new Date('2026-06-05T12:00:00+08:00'), {
		projectNotePathPattern: 'Projects/{{AREA}}/{{PROJECT}}/{{PROJECT}}.md',
	});

	assert.equal(model.projectTargets[0]?.path, 'Projects/科学研究/DualBasic/DualBasic.md');
	assert.equal(defaultProjectNotePathFromTag('#科学研究/DualBasic', 'Projects/{{AREA}}/{{PROJECT}}.md'), 'Projects/科学研究/DualBasic.md');
});

test('renderProjectTodoSection writes Tasks-compatible main rows and non-task step details', () => {
	const model = buildLifeOsSyncModel(listsWithTasks, mappings, new Date('2026-06-05T12:00:00+08:00'));
	const section = renderProjectTodoSection(model.projectTargets[0]?.tasks ?? [], '2026-06-05 12:00');

	assert.match(section, /^## Microsoft To Do/m);
	assert.match(section, /<!-- mstodo:project:start -->/);
	assert.match(section, /- \[ \] 写实验设计 #mstodo #科学研究\/DualBasic #mstodo\/list\/Research ⏫ 📅 2026-06-05 \^mstodo-list-1-task-1/);
	assert.match(section, /  - 备注: 第一行/);
	assert.match(section, /  - 步骤:/);
	assert.match(section, /    - DONE 定变量/);
	assert.doesNotMatch(section, /    - \[[ x]\] 定变量/);
});

test('renderProjectTodoSection supports a configurable section heading', () => {
	const model = buildLifeOsSyncModel(listsWithTasks, mappings, new Date('2026-06-05T12:00:00+08:00'));
	const section = renderProjectTodoSection(model.projectTargets[0]?.tasks ?? [], '2026-06-05 12:00', {
		projectTodoHeading: '## 任务同步',
	});

	assert.match(section, /^## 任务同步/m);
	assert.doesNotMatch(section, /^## Microsoft To Do/m);
});

test('upsertProjectTodoSection replaces the controlled block before LifeOS without touching manual text', () => {
	const original = [
		'## 规划',
		'保留我手写的内容',
		'',
		'## LifeOS',
		'```LifeOS',
		'TaskListByTag',
		'```',
		'',
	].join('\n');
	const updated = upsertProjectTodoSection(original, '## Microsoft To Do\n\n<!-- mstodo:project:start -->\n- [ ] A #mstodo ^mstodo-a\n<!-- mstodo:project:end -->\n');

	assert.match(updated, /保留我手写的内容/);
	assert.ok(updated.indexOf('## Microsoft To Do') < updated.indexOf('## LifeOS'));

	const replaced = upsertProjectTodoSection(updated, '## Microsoft To Do\n\n<!-- mstodo:project:start -->\n- [ ] B #mstodo ^mstodo-b\n<!-- mstodo:project:end -->\n');
	assert.doesNotMatch(replaced, /\^mstodo-a/);
	assert.match(replaced, /\^mstodo-b/);
});

test('upsertProjectTodoSection can insert before a configured project heading', () => {
	const original = [
		'## 背景',
		'保留',
		'',
		'## Tasks',
		'- [ ] 手动任务',
		'',
	].join('\n');
	const updated = upsertProjectTodoSection(
		original,
		'## 任务同步\n\n<!-- mstodo:project:start -->\n- [ ] A #mstodo ^mstodo-a\n<!-- mstodo:project:end -->\n',
		{ projectTodoHeading: '## 任务同步', projectInsertBeforeHeading: '## Tasks' },
	);

	assert.ok(updated.indexOf('## 任务同步') < updated.indexOf('## Tasks'));
	assert.match(updated, /- \[ \] 手动任务/);
});

test('upsertProjectTodoSection appends when the insert-before heading is blank', () => {
	const original = '## LifeOS\n保留\n';
	const updated = upsertProjectTodoSection(
		original,
		'## Microsoft To Do\n\n<!-- mstodo:project:start -->\n- [ ] A #mstodo ^mstodo-a\n<!-- mstodo:project:end -->\n',
		{ projectInsertBeforeHeading: '' },
	);

	assert.ok(updated.indexOf('## Microsoft To Do') > updated.indexOf('## LifeOS'));
});

test('renderProjectNoteTemplate expands project and date placeholders', () => {
	const rendered = renderProjectNoteTemplate(
		'# {{PROJECT}}\n\narea={{AREA}}\ntag={{PROJECT_TAG}}\nlist={{LIST_NAME}}\nday={{YYYY-MM-DD}}\n',
		{
			projectTag: '#科学研究/DualBasic',
			listName: 'Research',
			projectNotePath: '1. 项目/科学研究-DualBasic/DualBasic.README.md',
			date: new Date('2026-06-05T12:00:00+08:00'),
		},
	);

	assert.match(rendered, /^# DualBasic/m);
	assert.match(rendered, /area=科学研究/);
	assert.match(rendered, /tag=#科学研究\/DualBasic/);
	assert.match(rendered, /list=Research/);
	assert.match(rendered, /day=2026-06-05/);
});

test('renderDailyTodoBlock writes read-only links, not Tasks checkboxes', () => {
	const model = buildLifeOsSyncModel(listsWithTasks, mappings, new Date('2026-06-05T12:00:00+08:00'));
	const block = renderDailyTodoBlock(model.todayTasks, '2026-06-05 12:00');

	assert.match(block, /<!-- mstodo:today:start -->/);
	assert.match(block, /\[\[1\. 项目\/科学研究-DualBasic\/DualBasic\.README#\^mstodo-list-1-task-1\|写实验设计\]\]/);
	assert.match(block, /\[\[Microsoft To Do#\^mstodo-list-2-task-2\|未映射任务\]\]/);
	assert.doesNotMatch(block, /- \[[ x]\]/);
});

test('upsertDailyTodoBlock inserts under task heading and replaces only the controlled block', () => {
	const original = [
		'## 日常记录',
		'',
		'### 任务',
		'- [ ] 手写任务',
		'',
		'### 记录',
		'- 手写记录',
		'',
	].join('\n');
	const block = '<!-- mstodo:today:start -->\n- [[Task|Task]]\n<!-- mstodo:today:end -->';
	const updated = upsertDailyTodoBlock(original, block);

	assert.match(updated, /### 任务\n<!-- mstodo:today:start -->/);
	assert.match(updated, /- \[ \] 手写任务/);
	assert.match(updated, /### 记录\n- 手写记录/);

	const replaced = upsertDailyTodoBlock(updated, '<!-- mstodo:today:start -->\n- [[Other|Other]]\n<!-- mstodo:today:end -->');
	assert.doesNotMatch(replaced, /\[\[Task\|Task\]\]/);
	assert.match(replaced, /\[\[Other\|Other\]\]/);
	assert.match(replaced, /- \[ \] 手写任务/);
});

test('upsertDailyTodoBlock uses a configurable daily task heading', () => {
	const original = [
		'# 2026-06-05',
		'',
		'### 今日任务',
		'- [ ] 手写任务',
		'',
		'### 记录',
		'手写记录',
		'',
	].join('\n');
	const block = '<!-- mstodo:today:start -->\n- [[Task|Task]]\n<!-- mstodo:today:end -->';
	const updated = upsertDailyTodoBlock(original, block, { dailyTaskHeading: '### 今日任务' });

	assert.match(updated, /### 今日任务\n<!-- mstodo:today:start -->/);
	assert.match(updated, /- \[ \] 手写任务/);
	assert.doesNotMatch(updated, /### 任务\n/);
});

test('buildDailyNotePath expands LifeOS date placeholders', () => {
	const path = buildDailyNotePath(
		'0. 周期笔记/{{YYYY}}/Daily/{{MM}}/{{YYYY-MM-DD}}.md',
		new Date('2026-06-05T12:00:00+08:00'),
	);

	assert.equal(path, '0. 周期笔记/2026/Daily/06/2026-06-05.md');
});

test('isExpectedVaultName rejects writes for the wrong vault', () => {
	assert.equal(isExpectedVaultName('obsidian@lifeos-mariozzj', 'obsidian@lifeos-mariozzj'), true);
	assert.equal(isExpectedVaultName('Other Vault', 'obsidian@lifeos-mariozzj'), false);
	assert.equal(isExpectedVaultName('Any Vault', ''), true);
});
