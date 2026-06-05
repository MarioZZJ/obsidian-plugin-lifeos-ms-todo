import test from 'node:test';
import assert from 'node:assert/strict';
import { requestGraphUrlWithRetry, type GraphRequestFn } from '../../src/api/graph-request';

test('requestGraphUrlWithRetry retries 429 responses using Retry-After', async () => {
	const sleeps: number[] = [];
	let calls = 0;
	const request: GraphRequestFn = async (options) => {
		calls += 1;
		assert.equal(options.throw, false);
		if (calls === 1) {
			return makeResponse(429, { 'Retry-After': '2' });
		}
		return makeResponse(200, {}, { ok: true });
	};

	const response = await requestGraphUrlWithRetry(
		{ url: 'https://graph.microsoft.com/v1.0/me/todo/lists' },
		request,
		async (ms) => { sleeps.push(ms); },
		{ maxAttempts: 3, baseDelayMs: 100 },
	);

	assert.equal(response.status, 200);
	assert.deepEqual(response.json, { ok: true });
	assert.equal(calls, 2);
	assert.deepEqual(sleeps, [2000]);
});

test('requestGraphUrlWithRetry uses exponential backoff when Retry-After is missing', async () => {
	const sleeps: number[] = [];
	let calls = 0;
	const request: GraphRequestFn = async () => {
		calls += 1;
		return calls < 3 ? makeResponse(503) : makeResponse(204);
	};

	const response = await requestGraphUrlWithRetry(
		{ url: 'https://graph.microsoft.com/v1.0/me/todo/lists' },
		request,
		async (ms) => { sleeps.push(ms); },
		{ maxAttempts: 3, baseDelayMs: 250 },
	);

	assert.equal(response.status, 204);
	assert.deepEqual(sleeps, [250, 500]);
});

test('requestGraphUrlWithRetry returns final retryable response after max attempts', async () => {
	let calls = 0;
	const request: GraphRequestFn = async () => {
		calls += 1;
		return makeResponse(429);
	};

	const response = await requestGraphUrlWithRetry(
		{ url: 'https://graph.microsoft.com/v1.0/me/todo/lists' },
		request,
		async () => undefined,
		{ maxAttempts: 2, baseDelayMs: 1 },
	);

	assert.equal(response.status, 429);
	assert.equal(calls, 2);
});

function makeResponse(status: number, headers: Record<string, string> = {}, json: unknown = {}): Awaited<ReturnType<GraphRequestFn>> {
	return {
		status,
		headers,
		json,
		text: '',
		arrayBuffer: new ArrayBuffer(0),
	};
}
