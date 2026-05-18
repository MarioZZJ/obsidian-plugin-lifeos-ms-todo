export interface MsTodoSettings {
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: number;
    markdownSyncPath: string;
    syncAfterLogin: boolean;
    syncOnStartup: boolean;
}

export const DEFAULT_SETTINGS: MsTodoSettings = {
    accessToken: '',
    refreshToken: '',
    tokenExpiresAt: 0,
    markdownSyncPath: 'Microsoft To Do.md',
    syncAfterLogin: true,
    syncOnStartup: false,
};
