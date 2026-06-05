import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';

export type GraphRequestFn = (request: RequestUrlParam) => Promise<RequestUrlResponse>;
export type SleepFn = (milliseconds: number) => Promise<void>;

export interface GraphRetryOptions {
	maxAttempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 60000;

export async function requestGraphUrlWithRetry(
	request: RequestUrlParam,
	requestFn: GraphRequestFn,
	sleep: SleepFn = sleepMs,
	options: GraphRetryOptions = {},
): Promise<RequestUrlResponse> {
	const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
	let response: RequestUrlResponse | null = null;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		response = await requestFn({ ...request, throw: false });
		if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
			return response;
		}

		await sleep(getRetryDelayMs(response, attempt, options));
	}

	return response as RequestUrlResponse;
}

export function graphErrorMessage(response: RequestUrlResponse): string {
	const detail = extractGraphErrorDetail(response);
	return detail ? `Request failed status ${response.status}: ${detail}` : `Request failed status ${response.status}`;
}

function isRetryableStatus(status: number): boolean {
	return status === 429 || status === 503 || status === 504;
}

function getRetryDelayMs(response: RequestUrlResponse, attempt: number, options: GraphRetryOptions): number {
	const retryAfter = getHeader(response.headers, 'Retry-After');
	const retryAfterMs = parseRetryAfterMs(retryAfter);
	const fallback = (options.baseDelayMs || DEFAULT_BASE_DELAY_MS) * (2 ** (attempt - 1));
	const maxDelay = options.maxDelayMs || DEFAULT_MAX_DELAY_MS;
	return Math.min(retryAfterMs || fallback, maxDelay);
}

function parseRetryAfterMs(value: string): number {
	if (!value) return 0;

	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return seconds * 1000;
	}

	const dateMs = Date.parse(value);
	if (Number.isNaN(dateMs)) return 0;
	return Math.max(0, dateMs - Date.now());
}

function getHeader(headers: Record<string, string>, headerName: string): string {
	const target = headerName.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === target) return value;
	}
	return '';
}

function extractGraphErrorDetail(response: RequestUrlResponse): string {
	const json = response.json as unknown;
	if (isGraphErrorBody(json)) {
		return json.error.message || json.error.code || '';
	}

	return response.text.trim();
}

function isGraphErrorBody(value: unknown): value is { error: { code?: string; message?: string } } {
	if (!value || typeof value !== 'object' || !('error' in value)) return false;
	const error = (value as { error?: unknown }).error;
	return Boolean(error && typeof error === 'object');
}

function sleepMs(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, milliseconds);
	});
}
