import type { RemoteConfig, UpdateError, UPDATE_ERROR } from './updater';
import type { Package, RegistryResponse } from './helpers';
import { DEFAULT_CHECK_INTERVAL } from './constants';
import { compare } from 'compare-versions';
import { performUpdate } from './updater';
import { fetchRegistry } from './helpers';
import type { Disposable } from 'vscode';
import { window } from 'vscode';

export enum UPDATE_CALLBACK_RESULT {
	IGNORE = 'IGNORE',
	UPDATE = 'UPDATE',
	DEFAULT_BEHAVIOR = 'DEFAULT_BEHAVIOR',
}

export interface UpdateCheckResultFailure {
	checkStatus: 'error';
	error: UPDATE_ERROR;
}

export interface UpdateCheckResultSuccess {
	checkStatus: 'success';
	updateAvailable: boolean;
	currentVersion: string;
	latestVersion: string;
	registryResponse: RegistryResponse;
}

export type UpdateCheckResult =
	| UpdateCheckResultFailure
	| UpdateCheckResultSuccess;

interface UpdateResultSuccess {
	updateStatus: 'success';
	didUpdate: boolean;
}

interface UpdateResultError {
	updateStatus: 'error';
	didUpdate: boolean;
	error: UPDATE_ERROR;
}

export type UpdateResult = UpdateResultSuccess | UpdateResultError;

type UpdateCheckResultSuccessWithUpdate = UpdateCheckResultSuccess &
	UpdateResult;

export type UpdateInstallCheckResult =
	| UpdateCheckResultFailure
	| UpdateCheckResultSuccess
	| UpdateCheckResultSuccessWithUpdate;

export interface UpdateConfig {
	/**
	 * Friendly name of extension, is displayed to the user when prompting for update permission
	 */
	friendlyName: string;
	/**
	 * Whether to wait for user approval or to just install immediately
	 */
	requireUserConfirmation: boolean;
	/**
	 * If provided, force update without asking for user confirmation if a version
	 * with the given tag exists in the registry.
	 * @see https://docs.npmjs.com/cli/v9/commands/npm-dist-tag
	 */
	forceUpdateOnTag?: string;
	/**
	 * Warn the user when checking fails or not. Ignore is generally best here
	 * since the user being offline should not warrant a warning.
	 */
	onCheckFail: 'notify' | 'ignore';
	/**
	 * Optional callback that can change behavior of installation
	 */
	onUpdateAvailable?: (
		result: UpdateCheckResultSuccess
	) => UPDATE_CALLBACK_RESULT | void;
	/**
	 * Interval by which checking occurs
	 * @default 3600000
	 */
	checkInterval?: number;
	/**
	 * Configuration of remote endpoint. Uses extension context to determine endpoint.
	 */
	remote: RemoteConfig;
}

export class AutoUpdateChecker implements Disposable {
	private readonly _interval: NodeJS.Timeout;

	public constructor(private readonly _config: UpdateConfig) {
		this._interval = setInterval(
			() => void this.forceCheckUpdates(),
			this._config.checkInterval ?? DEFAULT_CHECK_INTERVAL
		);
		setImmediate(() => {
			void this.forceCheckUpdates();
		});
	}

	private async _shouldUpdate(
		updates: UpdateCheckResultSuccess
	): Promise<boolean> {
		if (this._config.forceUpdateOnTag) {
			// Check if version for given tag is equal to current version
			const versionForTagged =
				updates.registryResponse['dist-tags'][
					this._config.forceUpdateOnTag
				];
			if (versionForTagged === updates.latestVersion) {
				return true;
			}
		}
		const choice = await window.showInformationMessage(
			`${this._config.friendlyName}: update available`,
			'Update'
		);
		if (choice === 'Update') {
			return true;
		}
		// Don't auto-update anymore for the rest of this session
		return false;
	}

	public async getUpdates(): Promise<UpdateCheckResult> {
		let response: RegistryResponse;
		try {
			response = await fetchRegistry(this._config.remote);
		} catch (e) {
			return {
				checkStatus: 'error',
				error: (e as UpdateError).error,
			};
		}

		const currentVersion = (
			this._config.remote.context.extension.packageJSON as Package
		).version;
		const latestVersion = response['dist-tags'].latest;
		return {
			checkStatus: 'success',
			currentVersion,
			latestVersion,
			updateAvailable: compare(currentVersion, latestVersion, '<'),
			registryResponse: response,
		};
	}

	public async forceCheckUpdates(): Promise<UpdateInstallCheckResult> {
		const updates = await this.getUpdates();
		if (updates.checkStatus === 'error') {
			if (this._config.onCheckFail === 'notify') {
				void window.showWarningMessage(
					`${this._config.friendlyName}: update check failed`
				);
			}
			return updates;
		}

		if (!updates.updateAvailable) {
			return {
				...updates,
				didUpdate: false,
			};
		}

		const result =
			this._config.onUpdateAvailable?.(updates) ??
			UPDATE_CALLBACK_RESULT.DEFAULT_BEHAVIOR;

		if (result === UPDATE_CALLBACK_RESULT.IGNORE) {
			return {
				...updates,
				didUpdate: false,
			};
		}

		if (
			result === UPDATE_CALLBACK_RESULT.DEFAULT_BEHAVIOR &&
			this._config.requireUserConfirmation
		) {
			if (!(await this._shouldUpdate(updates))) {
				// Don't auto-update anymore for the rest of this session
				this.dispose();
				return {
					...updates,
					didUpdate: false,
				};
			}
		}

		const updateSuccess = await performUpdate(
			this._config.friendlyName,
			this._config.remote
		);

		return {
			...updates,
			...updateSuccess,
		};
	}

	public dispose(): void {
		clearInterval(this._interval);
	}
}
