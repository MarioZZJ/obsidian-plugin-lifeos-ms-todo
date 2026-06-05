import {
	DEFAULT_DAILY_TASK_HEADING,
	DEFAULT_PROJECT_INSERT_BEFORE_HEADING,
	DEFAULT_PROJECT_NOTE_PATH_PATTERN,
	DEFAULT_PROJECT_TODO_HEADING,
	type LifeOsTodoListMapping,
} from './sync/lifeos-markdown';

export interface MsTodoSettings {
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: number;
    markdownSyncPath: string;
    syncAfterLogin: boolean;
    syncOnStartup: boolean;
    lifeosSyncEnabled: boolean;
    expectedVaultName: string;
    dailyNotePathPattern: string;
    dailyTemplatePath: string;
    dailyTaskHeading: string;
    unmappedInboxPath: string;
    projectNotePathPattern: string;
    projectTemplatePath: string;
    createMissingProjectNotes: boolean;
    projectTodoHeading: string;
    projectInsertBeforeHeading: string;
    todoListMappings: LifeOsTodoListMapping[];
}

export const DEFAULT_SETTINGS: MsTodoSettings = {
    accessToken: '',
    refreshToken: '',
    tokenExpiresAt: 0,
    markdownSyncPath: 'Microsoft To Do.md',
    syncAfterLogin: true,
    syncOnStartup: false,
    lifeosSyncEnabled: false,
    expectedVaultName: 'obsidian@lifeos-mariozzj',
    dailyNotePathPattern: '0. 周期笔记/{{YYYY}}/Daily/{{MM}}/{{YYYY-MM-DD}}.md',
    dailyTemplatePath: '0. 周期笔记/Templates/Daily.md',
    dailyTaskHeading: DEFAULT_DAILY_TASK_HEADING,
    unmappedInboxPath: 'Microsoft To Do.md',
    projectNotePathPattern: DEFAULT_PROJECT_NOTE_PATH_PATTERN,
    projectTemplatePath: '1. 项目/Templates/Project.md',
    createMissingProjectNotes: false,
    projectTodoHeading: DEFAULT_PROJECT_TODO_HEADING,
    projectInsertBeforeHeading: DEFAULT_PROJECT_INSERT_BEFORE_HEADING,
    todoListMappings: [],
};
