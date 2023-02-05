import { fetchRegistry, findPathsRecursively } from './helpers';
import { commands, extensions, Uri, window } from 'vscode';
import { RELOAD_WAIT_TIME } from './constants';
import type { ExtensionContext } from 'vscode';
import type { UpdateResult } from './checker';
import * as fs from 'fs/promises';
import { request } from 'https';
import * as tar from 'tar';

export enum UPDATE_ERROR {
	CHECK_REQ_FAILED,
	UPDATE_REQ_FAILED,
	DOWNLOAD_OR_EXTRACT_FAILED,
	NO_VSIX,
	MULTIPLE_VSIX,
}

export class UpdateError extends Error {
	public constructor(public readonly error: UPDATE_ERROR) {
		super();
	}
}

export type RemoteConfig = {
	context: ExtensionContext;
};

async function downloadTarball(
	ctx: ExtensionContext,
	url: string,
	version: string
): Promise<string> {
	const outDir = ctx.asAbsolutePath(
		`auto-updates/${version.replace(/\./g, '-')}`
	);
	await fs.mkdir(outDir, { recursive: true });
	return new Promise<string>((resolve, reject) => {
		const req = request(url, (res) => {
			res.pipe(
				tar.x({
					cwd: outDir,
				})
			);
			res.on('error', () =>
				reject(new UpdateError(UPDATE_ERROR.DOWNLOAD_OR_EXTRACT_FAILED))
			);
			res.on('end', () => resolve(outDir));
		});
		req.once('error', () => {
			reject(new UpdateError(UPDATE_ERROR.UPDATE_REQ_FAILED));
		});
		req.end();
	});
}

async function _performUpdate(
	friendlyName: string,
	remoteConfig: RemoteConfig,
	onUpdateInstalled?: () => void
): Promise<UpdateResult> {
	const response = await fetchRegistry(remoteConfig);

	const version = response['dist-tags'].latest;
	const tarballUrl = response.versions[version].dist.tarball;
	const outDir = await downloadTarball(
		remoteConfig.context,
		tarballUrl,
		version
	);

	// Now find a .vsix file in the outDir
	const matches = await findPathsRecursively(outDir, /.vsix$/);
	if (matches.length === 0) {
		return {
			didUpdate: false,
			updateStatus: 'error',
			error: UPDATE_ERROR.NO_VSIX,
		};
	} else if (matches.length > 1) {
		return {
			didUpdate: false,
			updateStatus: 'error',
			error: UPDATE_ERROR.MULTIPLE_VSIX,
		};
	}

	// Attach listener early
	const onExtensionsChange = new Promise((resolve) =>
		extensions.onDidChange(resolve)
	);

	// Update!
	void commands.executeCommand(
		'workbench.extensions.installExtension',
		Uri.file(matches[0])
	);

	if (onUpdateInstalled) {
		onUpdateInstalled();
	} else {
		await Promise.race([
			new Promise((resolve) => setTimeout(resolve, RELOAD_WAIT_TIME)),
			onExtensionsChange,
		]);
		void window
			.showInformationMessage(
				`${friendlyName}: extension was updated, please reload the window`,
				'Reload Window'
			)
			.then((choice) => {
				if (choice === 'Reload Window') {
					void commands.executeCommand(
						'workbench.action.reloadWindow'
					);
				}
			});
	}

	return {
		didUpdate: true,
		updateStatus: 'success',
	};
}

export async function performUpdate(
	friendlyName: string,
	remoteConfig: RemoteConfig,
	onUpdateInstalled?: () => void
): Promise<UpdateResult> {
	try {
		return _performUpdate(friendlyName, remoteConfig, onUpdateInstalled);
	} catch (e) {
		if (e instanceof UpdateError) {
			return {
				updateStatus: 'error',
				didUpdate: false,
				error: e.error,
			};
		}
		throw e;
	}
}
