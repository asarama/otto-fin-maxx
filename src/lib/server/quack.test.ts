import { describe, it, expect, afterEach } from 'vitest';
import { quackUri } from './quack';

describe('quackUri', () => {
	const prev = {
		host: process.env.QUACK_HOST,
		port: process.env.QUACK_PORT,
	};

	afterEach(() => {
		process.env.QUACK_HOST = prev.host;
		process.env.QUACK_PORT = prev.port;
	});

	it('defaults to 127.0.0.1:9494', () => {
		delete process.env.QUACK_HOST;
		delete process.env.QUACK_PORT;
		expect(quackUri()).toBe('quack:127.0.0.1:9494');
	});

	it('reads host and port from env', () => {
		process.env.QUACK_HOST = '10.0.0.5';
		process.env.QUACK_PORT = '7777';
		expect(quackUri()).toBe('quack:10.0.0.5:7777');
	});
});

import { attachDb } from './quack';

describe('attachDb', () => {
	it('rejects with a connection error when no server is listening', async () => {
		process.env.QUACK_HOST = '127.0.0.1';
		process.env.QUACK_PORT = '9998';
		process.env.QUACK_TOKEN = 'local-dev';
		await expect(attachDb()).rejects.toThrow(/Could not connect|IO Error/);
	});
});
