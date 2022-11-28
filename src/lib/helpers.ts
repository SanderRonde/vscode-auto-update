import { UpdateError, UPDATE_ERROR } from './updater';
import type { RemoteConfig } from './updater';
import * as fs from 'fs/promises';
import { request } from 'https';
import * as path from 'path';

interface RegistryResponseVersion {
	name: string;
	version: string;
	dist: {
		shasum: string;
		tarball: string;
	};
}

export interface RegistryResponse {
	name: string;
	versions: Record<string, RegistryResponseVersion>;
	'dist-tags': Record<string, string>;
}

export interface Package {
	publishConfig?: {
		registry: string;
	};
	name: string;
	version: string;
}

function getRemoteUrl(remoteConfig: RemoteConfig): string {
	const pkg = remoteConfig.context.extension.packageJSON as Package;
	if (!pkg.name) {
		throw new Error('Auto-update: extension name not found in package');
	}
	if (!pkg.publishConfig) {
		throw new Error(
			'Auto-update: extension publishConfig not found. Either supply it or manually pass URL'
		);
	}
	if (!pkg.publishConfig.registry) {
		throw new Error(
			'Auto-update: extension publishConfig.registry not found. Either supply it or manually pass URL'
		);
	}

	let registry = pkg.publishConfig.registry;
	if (registry.endsWith('/')) {
		registry = registry.slice(0, -1);
	}
	return `${registry}/${pkg.name}`;
}

export function fetchRegistry(
	remoteConfig: RemoteConfig
): Promise<RegistryResponse> {
	return new Promise<RegistryResponse>((resolve, reject) => {
		const url = getRemoteUrl(remoteConfig);
		const req = request(url, (res) => {
			if (res.statusCode !== 200) {
				reject(new UpdateError(UPDATE_ERROR.CHECK_REQ_FAILED));
				return;
			}

			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				try {
					const result = JSON.parse(data) as RegistryResponse;
					resolve(result);
				} catch (e) {
					reject(e);
				}
			});
		});
		req.once('error', () => {
			reject(new UpdateError(UPDATE_ERROR.CHECK_REQ_FAILED));
		});
		req.end();
	});
}

export async function findPathsRecursively(
	dir: string,
	regex: RegExp
): Promise<string[]> {
	const files = await fs.readdir(dir);
	const paths = await Promise.all(
		files.map(async (file) => {
			const filePath = path.join(dir, file);
			const stat = await fs.stat(filePath);
			if (stat.isDirectory()) {
				return findPathsRecursively(filePath, regex);
			} else if (stat.isFile() && filePath.match(regex)) {
				return [filePath];
			} else {
				return [];
			}
		})
	);
	return paths.flat();
}
