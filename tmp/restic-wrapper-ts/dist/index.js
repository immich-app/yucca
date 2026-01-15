import * as z from "zod";
import EventEmitter from "node:events";
import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import { TextDecoder } from "node:util";

//#region src/errors.ts
var MissingFilesError = class extends Error {
	constructor() {
		super("Specify files to create snapshot from with .addFile(..)");
	}
};
var MissingRepositoryError = class extends Error {
	constructor() {
		super("Specify a repository with .repository(..) or .repositoryFile(..)");
	}
};
var MissingPasswordError = class extends Error {
	constructor() {
		super("Specify a repository password with .password(..), .passwordFile(..), or .passwordCommand(..)");
	}
};
var MissingSnapshotError = class extends Error {
	constructor() {
		super("Specify a snapshot with .snapshot(..)");
	}
};
var MissingTargetError = class extends Error {
	constructor() {
		super("Specify a target with .target(..)");
	}
};
var MissingMatchError = class extends Error {
	constructor() {
		super("Specify what to match with .match(..)");
	}
};
var MissingCompareError = class extends Error {
	constructor() {
		super("Specify what to compare with .compare(..)");
	}
};
const errorMessage = z.union([
	z.object({
		message_type: z.literal("exit_error"),
		code: z.number().int(),
		message: z.string()
	}),
	z.object({
		message_type: z.literal("error"),
		message: z.string().optional(),
		error: z.object({ message: z.string() }).optional(),
		during: z.string().optional(),
		item: z.string().optional()
	}),
	z.object({
		message_type: z.literal("raw"),
		message: z.string()
	})
]);
var TryParseError = class extends Error {
	error;
	constructor(message) {
		const error = message.split("\n").map((item) => {
			try {
				return errorMessage.parse(JSON.parse(item));
			} catch {
				return {
					message_type: "raw",
					message: item
				};
			}
		});
		super(error.map((e) => e.message_type === "raw" ? e.message : e.message_type === "exit_error" ? `Restic exited with code ${e.code}: ${e.message}` : `Restic error${e.during ? ` during ${e.during}` : ""}${e.item ? ` on ${e.item}` : ""}: ${e.error?.message ?? e.message ?? "unknown error"}`).join("\n"));
		this.error = error;
	}
};
var ResticUnknownError = class extends Error {};
var ResticGoRuntimeError = class extends Error {};
var ResticCommandFailedError = class extends TryParseError {};
var ResticBackupCommandCouldNotReadSourceDataError = class extends TryParseError {};
var ResticRepositoryDoesNotExistError = class extends TryParseError {};
var ResticFailedToLockRepositoryError = class extends TryParseError {};
var ResticWrongPasswordError = class extends TryParseError {};
var ResticInterruptedError = class extends TryParseError {};

//#endregion
//#region src/constants.ts
let ResticEnvironmentVariable = /* @__PURE__ */ function(ResticEnvironmentVariable$1) {
	ResticEnvironmentVariable$1["ResticRepository"] = "RESTIC_REPOSITORY";
	ResticEnvironmentVariable$1["ResticRepositoryFile"] = "RESTIC_REPOSITORY_FILE";
	ResticEnvironmentVariable$1["ResticPassword"] = "RESTIC_PASSWORD";
	ResticEnvironmentVariable$1["ResticPasswordCommand"] = "RESTIC_PASSWORD_COMMAND";
	ResticEnvironmentVariable$1["ResticPasswordFile"] = "RESTIC_PASSWORD_FILE";
	return ResticEnvironmentVariable$1;
}({});

//#endregion
//#region src/utils/streams.ts
var JsonLinesReader = class JsonLinesReader extends Writable {
	buffer = [];
	static decoder = new TextDecoder();
	constructor(callback, filter) {
		super();
		this.callback = callback;
		this.filter = filter;
	}
	_write(chunk, _encoding, callback) {
		for (const byte of chunk) if (byte === 10) try {
			this.flush();
		} catch (error) {
			callback(error);
			return;
		}
		else this.buffer.push(byte);
		callback();
	}
	flush() {
		if (this.buffer.length > 0) {
			const text = JsonLinesReader.decoder.decode(new Uint8Array(this.buffer));
			try {
				if (!this.filter || this.filter(text)) this.callback(JSON.parse(text));
			} catch (error) {
				/* istanbul ignore else @preserve */
				if (process.env.NODE_ENV === "test") console.error("Failing output:", text);
				throw error;
			}
			this.buffer = [];
		}
	}
	_final(callback) {
		try {
			this.flush();
			callback();
		} catch (error) {
			callback(error);
		}
	}
};

//#endregion
//#region src/utils/process.ts
function restic(argsBuilder) {
	argsBuilder.validate();
	return new Promise((resolve, reject) => {
		const process$1 = spawn("restic", argsBuilder.toArgs(), { env: argsBuilder.toEnv() });
		process$1.on("error", reject);
		argsBuilder.emit("process", process$1);
		let stderr = "";
		process$1.stderr.on("data", (data$1) => stderr += data$1);
		let finished = 0;
		function finish() {
			if (++finished === 2) resolve(data);
		}
		let data = [];
		if (argsBuilder.format() === "none") {
			data = void 0;
			process$1.stdout.on("close", finish);
		} else if (argsBuilder.format() === "json") {
			let stdout = "";
			process$1.stdout.on("data", (data$1) => stdout += data$1);
			process$1.stdout.on("close", () => {
				try {
					data = argsBuilder.parse(JSON.parse(stdout));
					finish();
				} catch (error) {
					console.error("Failing output:", stdout);
					reject(error);
				}
			});
		} else {
			const jsonLinesReader = new JsonLinesReader((line) => {
				const valid = argsBuilder.parse(line);
				argsBuilder.emit("event", valid);
				if (argsBuilder.format() === "jsonlines-no-log") data = valid;
				else data.push(valid);
			}, (line) => argsBuilder.setFilter(line));
			process$1.stdout.pipe(jsonLinesReader);
			jsonLinesReader.on("close", finish);
		}
		process$1.on("exit", (code) => {
			switch (code) {
				case 0:
					finish();
					break;
				case 1:
					reject(new ResticCommandFailedError(stderr.trimEnd()));
					break;
				case 2:
					reject(new ResticGoRuntimeError(stderr.trimEnd()));
					break;
				case 3:
					reject(new ResticBackupCommandCouldNotReadSourceDataError(stderr.trimEnd()));
					break;
				case 10:
					reject(new ResticRepositoryDoesNotExistError(stderr.trimEnd()));
					break;
				case 11:
					reject(new ResticFailedToLockRepositoryError(stderr.trimEnd()));
					break;
				case 12:
					reject(new ResticWrongPasswordError(stderr.trimEnd()));
					break;
				case 130:
					reject(new ResticInterruptedError(stderr.trimEnd()));
					break;
				default: reject(new ResticUnknownError(stderr.trimEnd()));
			}
		});
	});
}

//#endregion
//#region src/utils/args.ts
const baseArgs = z.object({
	cacert: z.string().optional(),
	cacheDir: z.string().optional(),
	cleanupCache: z.coerce.boolean(),
	compression: z.enum([
		"auto",
		"off",
		"max"
	]).optional(),
	httpUserAgent: z.string().optional(),
	insecureNoPassword: z.coerce.boolean(),
	insecureTls: z.coerce.boolean(),
	keyHint: z.string().optional(),
	limitDownload: z.number().optional(),
	limitUpload: z.number().optional(),
	noCache: z.coerce.boolean(),
	noExtraVerify: z.coerce.boolean(),
	noLock: z.coerce.boolean(),
	option: z.string().regex(/^.+=.+$/).optional(),
	packSize: z.number().optional(),
	retryLock: z.string().optional(),
	stuckRequestTimeout: z.string().optional(),
	tlsClientCert: z.string().optional(),
	verbose: z.coerce.boolean()
});
const commonFilterArgs = z.object({
	host: z.string().array().default([]),
	path: z.string().regex(/^(\\|\/)/).array().default([]),
	tag: z.string().array().default([])
});
const commonGroupBy = z.object({ groupBy: z.string().regex(/^(?:host|paths|tags)(?:,(?:host|paths|tags))*$|^$/).optional() });
var ArgumentBuilder = class extends EventEmitter {
	#dynamicArgs = {};
	#zodArgs;
	constructor(args = baseArgs) {
		super();
		this.#zodArgs = args;
		for (const [key, validator] of Object.entries(args.shape)) this[key] = (...args$1) => {
			const actualValidator = validator instanceof z.ZodDefault ? validator.def.innerType : validator instanceof z.ZodOptional ? validator.def.innerType : validator;
			if (actualValidator instanceof z.ZodArray) {
				if (!this.#dynamicArgs[key]) this.#dynamicArgs[key] = [];
				this.#dynamicArgs[key].push(...validator.parse(args$1));
			} else if (args$1[0] === void 0 && actualValidator instanceof z.ZodBoolean) this.#dynamicArgs[key] = true;
			else this.#dynamicArgs[key] = validator.parse(args$1[0]);
			return this;
		};
	}
	#password;
	get hasPassword() {
		return this.#password !== void 0;
	}
	password(password) {
		this.#password = {
			type: ResticEnvironmentVariable.ResticPassword,
			value: password
		};
		return this;
	}
	passwordCommand(command) {
		this.#password = {
			type: ResticEnvironmentVariable.ResticPasswordCommand,
			value: command
		};
		return this;
	}
	passwordFile(path) {
		this.#password = {
			type: ResticEnvironmentVariable.ResticPasswordFile,
			value: path
		};
		return this;
	}
	#repository;
	get hasRepository() {
		return this.#repository !== void 0;
	}
	repository(repository) {
		this.#repository = {
			type: ResticEnvironmentVariable.ResticRepository,
			value: repository
		};
		return this;
	}
	repositoryFile(path) {
		this.#repository = {
			type: ResticEnvironmentVariable.ResticRepositoryFile,
			value: path
		};
		return this;
	}
	setFilter() {
		return true;
	}
	validate() {
		this.#zodArgs.parse(this.#dynamicArgs);
	}
	format() {
		return "jsonlines";
	}
	toArgs() {
		const args = [this.command(), "--json"];
		for (const [key, value] of Object.entries(this.#dynamicArgs)) {
			const realKey = key.replaceAll(/[A-Z]/g, (str) => `-${str.toLowerCase()}`);
			const values = Array.isArray(value) ? value : [value];
			for (const value$1 of values) switch (typeof value$1) {
				case "string":
					args.push(`--${realKey}`, value$1);
					break;
				case "boolean":
					if (value$1) args.push(`--${realKey}`);
					break;
				case "number":
					args.push(`--${realKey}`, value$1.toString());
					break;
				case "undefined": break;
				default: if (value$1 instanceof Date) args.push(`--${realKey}`, value$1.toISOString());
				else console.warn(`Not sure how to handle ${key} = ${value$1} of type ${typeof value$1}`);
			}
		}
		return args;
	}
	toEnv() {
		const env = { PATH: process.env.PATH ?? "" };
		if (this.#repository) env[this.#repository.type] = this.#repository.value;
		if (this.#password) env[this.#password.type] = this.#password.value;
		return env;
	}
	async run() {
		return await restic(this);
	}
	on(event, listener) {
		return super.on(event, listener);
	}
	emit(event, ...args) {
		return super.emit(event, ...args);
	}
	once(event, listener) {
		return super.once(event, listener);
	}
	off(event, listener) {
		return super.off(event, listener);
	}
};
var RepositoryArgumentBuilder = class extends ArgumentBuilder {
	validate() {
		super.validate();
		if (!this.hasRepository) throw new MissingRepositoryError();
		if (!this.hasPassword) throw new MissingPasswordError();
	}
};

//#endregion
//#region src/commands/backup.ts
const backupArgs = z.object({
	...baseArgs.shape,
	...commonGroupBy.shape,
	dryRun: z.coerce.boolean(),
	exclude: z.string().array().default([]),
	excludeCaches: z.coerce.boolean(),
	excludeFile: z.string().array().default([]),
	excludeIfPresent: z.string().array().default([]),
	excludeLargerThan: z.string().regex(/^\d+(?:\.\d+)?[kKmMgGtT]$/).optional(),
	filesFrom: z.string().array().default([]),
	filesFromRaw: z.string().array().default([]),
	filesFromVerbatim: z.string().array().default([]),
	force: z.coerce.boolean(),
	host: z.string().optional(),
	iexclude: z.coerce.string().array().default([]),
	iexcludeFile: z.coerce.string().array().default([]),
	ignoreCtime: z.coerce.boolean(),
	ignoreInode: z.coerce.boolean(),
	noScan: z.coerce.boolean(),
	oneFileSystem: z.coerce.boolean(),
	parent: z.string().optional(),
	readConcurrency: z.number().optional(),
	skipIfUnchanged: z.coerce.boolean(),
	tag: z.string().array().default([]),
	time: z.date().optional(),
	withAtime: z.coerce.boolean()
});
var BackupArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(backupArgs);
	}
	#files = [];
	/**
	* Add one or more files to backup
	*/
	addFile(...files) {
		this.#files.push(...files);
		return this;
	}
	command() {
		return "backup";
	}
	format() {
		return "jsonlines-no-log";
	}
	toArgs() {
		return [...super.toArgs(), ...this.#files];
	}
	parse(data) {
		return backupMessage.parse(data);
	}
	validate() {
		super.validate();
		if (this.#files.length === 0) throw new MissingFilesError();
	}
};
/**
* Create a new snapshot saving given files and arguments
*
* ```typescript
* await backup()
*   .repository(..)
*   .password(..)
*   .addFile('my.json')
*   .addFile('path/to/folder')
* ```
*/
function backup() {
	return new BackupArgumentBuilder();
}
const backupStatusMessage = z.object({
	message_type: z.literal("status"),
	seconds_elapsed: z.number().int().nonnegative().optional(),
	seconds_remaining: z.number().int().nonnegative().optional(),
	percent_done: z.number(),
	total_files: z.number().int().nonnegative(),
	total_bytes: z.number().int().nonnegative(),
	files_done: z.number().int().nonnegative().optional(),
	bytes_done: z.number().int().nonnegative().optional(),
	error_count: z.number().int().nonnegative().optional(),
	current_files: z.array(z.string()).optional()
});
const backupVerboseStatusMessage = z.object({
	message_type: z.literal("verbose_status"),
	action: z.enum([
		"new",
		"unchanged",
		"modified",
		"scan_finished"
	]),
	item: z.string(),
	duration: z.number(),
	data_size: z.number().int().nonnegative(),
	data_size_in_repo: z.number().int().nonnegative(),
	metadata_size: z.number().int().nonnegative(),
	metadata_size_in_repo: z.number().int().nonnegative(),
	total_files: z.number().int().nonnegative()
});
const backupSummaryMessage = z.object({
	message_type: z.literal("summary"),
	dry_run: z.coerce.boolean(),
	files_new: z.number().int().nonnegative(),
	files_changed: z.number().int().nonnegative(),
	files_unmodified: z.number().int().nonnegative(),
	dirs_new: z.number().int().nonnegative(),
	dirs_changed: z.number().int().nonnegative(),
	dirs_unmodified: z.number().int().nonnegative(),
	data_blobs: z.number().int(),
	tree_blobs: z.number().int(),
	data_added: z.number().int().nonnegative(),
	data_added_packed: z.number().int().nonnegative(),
	total_files_processed: z.number().int().nonnegative(),
	total_bytes_processed: z.number().int().nonnegative(),
	backup_start: z.coerce.date(),
	backup_end: z.coerce.date(),
	total_duration: z.number(),
	snapshot_id: z.string()
});
const backupMessage = z.union([
	backupStatusMessage,
	backupVerboseStatusMessage,
	backupSummaryMessage
]);

//#endregion
//#region src/commands/cat.ts
var CatArgumentBuilder = class extends RepositoryArgumentBuilder {
	#target;
	#id;
	target(target, arg2) {
		this.#target = target;
		this.#id = arg2;
		return this;
	}
	command() {
		return "cat";
	}
	validate() {
		super.validate();
		if (!this.#target) throw new MissingTargetError();
	}
	format() {
		return "json";
	}
	toArgs() {
		const args = [this.#target];
		if (this.#id) args.push(this.#id);
		return [...super.toArgs(), ...args];
	}
	parse(data) {
		return data;
	}
};
/**
* Fetch data about various objects in repository.
*
* ```typescript
* const result = await cat()
*   .repository(join(dir, 'repository'))
*   .password('password')
*   .target('masterkey')
*   .run();
* ```
*/
function cat() {
	return new CatArgumentBuilder();
}

//#endregion
//#region src/commands/check.ts
const checkArgs = z.object({
	...baseArgs.shape,
	readData: z.coerce.boolean(),
	readDataSubset: z.string().optional(),
	withCache: z.coerce.boolean()
});
var CheckArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(checkArgs);
	}
	command() {
		return "check";
	}
	parse(data) {
		return checkMessage.parse(data);
	}
};
/**
* Test repository for errors and report any errors it finds.
*
* ```typescript
* const result = await check()
*   .repository(..)
*   .password(..)
*   .run();
* ```
*/
function check() {
	return new CheckArgumentBuilder();
}
const checkMessage = z.object({
	message_type: z.literal("summary"),
	num_errors: z.number().int().nonnegative(),
	broken_packs: z.string().array().nullable(),
	suggest_repair_index: z.coerce.boolean(),
	suggest_prune: z.coerce.boolean()
});

//#endregion
//#region src/commands/diff.ts
const diffArgs = z.object({
	...baseArgs.shape,
	metadata: z.coerce.boolean()
});
var DiffArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(diffArgs);
	}
	#snapshotIds;
	compare(snapshotA, snapshotB) {
		this.#snapshotIds = [snapshotA, snapshotB];
		return this;
	}
	command() {
		return "diff";
	}
	toArgs() {
		return [...super.toArgs(), ...this.#snapshotIds];
	}
	parse(data) {
		return diffMessage.parse(data);
	}
	validate() {
		if (!this.#snapshotIds) throw new MissingCompareError();
	}
};
/**
* Test repository for errors and report any errors it finds.
*
* ```typescript
* const diff = await diff()
*   .repository(..)
*   .password(..)
*   .compare("a", "b");
* ```
*/
function diff() {
	return new DiffArgumentBuilder();
}
const changeMessage = z.object({
	message_type: z.literal("change"),
	path: z.string(),
	modifier: z.string().regex(/[+-TMU?]+/)
});
const diffStat = z.object({
	files: z.number().int(),
	dirs: z.number().int(),
	others: z.number().int(),
	data_blobs: z.number().int(),
	tree_blobs: z.number().int(),
	bytes: z.number().int().nonnegative()
});
const statisticsMessage = z.object({
	message_type: z.literal("statistics"),
	source_snapshot: z.string(),
	target_snapshot: z.string(),
	changes_files: z.number().int().optional(),
	added: diffStat,
	removed: diffStat
});
const diffMessage = z.union([changeMessage, statisticsMessage]);

//#endregion
//#region src/commands/find.ts
const findArgs = z.object({
	...baseArgs.shape,
	...commonFilterArgs.shape,
	ignoreCase: z.coerce.boolean(),
	newest: z.string().optional(),
	oldest: z.string().optional(),
	reverse: z.coerce.boolean(),
	showPackId: z.coerce.boolean(),
	snapshot: z.string().array().default([])
});
var FindArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(findArgs);
	}
	#search = "object";
	#match = [];
	/* istanbul ignore next */
	blob() {
		this.#search = "blob";
		return this;
	}
	/* istanbul ignore next */
	tree() {
		this.#search = "tree";
		return this;
	}
	object() {
		this.#search = "object";
		return this;
	}
	match(match$1) {
		this.#match.push(match$1);
		return this;
	}
	command() {
		return "find";
	}
	toArgs() {
		const args = [];
		switch (this.#search) {
			case "blob":
				args.push("--blob");
				break;
			case "tree":
				args.push("--tree");
				break;
		}
		return [
			...super.toArgs(),
			...args,
			...this.#match
		];
	}
	format() {
		return "json";
	}
	parse(data) {
		switch (this.#search) {
			case "blob": return blobResults.parse(data);
			case "tree": return treeResults.parse(data);
			case "object": return objectResults.parse(data);
		}
	}
	validate() {
		super.validate();
		if (this.#match.length === 0) throw new MissingMatchError();
	}
};
/**
* Find matches for given search terms
*
* ```typescript
* const results = await find()
*   .repository(..)
*   .password(..)
*   .match('*.json')
*   .match('*.yml')
*   .run();
* ```
*/
function find() {
	return new FindArgumentBuilder();
}
const match = z.object({
	path: z.string(),
	permissions: z.string(),
	name: z.string().optional(),
	type: z.string(),
	atime: z.coerce.date(),
	mtime: z.coerce.date(),
	ctime: z.coerce.date(),
	user: z.string(),
	group: z.string(),
	inode: z.number().int().nonnegative(),
	mode: z.number().int().nonnegative(),
	device_id: z.number().int().nonnegative(),
	links: z.number().int().nonnegative(),
	link_target: z.string().optional(),
	uid: z.number().int().nonnegative(),
	gid: z.number().int().nonnegative(),
	size: z.number().int().nonnegative()
});
const objectResults = z.object({
	hits: z.number().int().nonnegative(),
	snapshot: z.string(),
	matches: match.array()
}).array();
const blobResults = z.array(z.object({
	object_type: z.literal("blob"),
	id: z.string(),
	path: z.string(),
	parent_tree: z.string(),
	snapshot: z.string(),
	time: z.string()
}));
const treeResults = z.array(z.object({
	object_type: z.literal("tree"),
	id: z.string(),
	path: z.string(),
	parent_tree: z.string(),
	snapshot: z.string(),
	time: z.string()
}));

//#endregion
//#region src/commands/snapshots.ts
const snapshotsArgs = z.object({
	...baseArgs.shape,
	...commonFilterArgs.shape,
	...commonGroupBy.shape,
	latest: z.number().optional()
});
var SnapshotsArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(snapshotsArgs);
	}
	command() {
		return "snapshots";
	}
	format() {
		return "json";
	}
	parse(data) {
		return snapshotsMessage.parse(data);
	}
};
/**
* List all snapshots
*
* ```typescript
* const snapshots = await snapshots()
*   .repository(..)
*   .password(..)
*   .run();
* ```
*/
function snapshots() {
	return new SnapshotsArgumentBuilder();
}
const snapshotSummary = z.object({
	backup_start: z.coerce.date(),
	backup_end: z.coerce.date(),
	files_new: z.number().int().nonnegative(),
	files_changed: z.number().int().nonnegative(),
	files_unmodified: z.number().int().nonnegative(),
	dirs_new: z.number().int().nonnegative(),
	dirs_changed: z.number().int().nonnegative(),
	dirs_unmodified: z.number().int().nonnegative(),
	data_blobs: z.number().int(),
	tree_blobs: z.number().int(),
	data_added: z.number().int().nonnegative(),
	data_added_packed: z.number().int().nonnegative(),
	total_files_processed: z.number().int().nonnegative(),
	total_bytes_processed: z.number().int().nonnegative()
});
const snapshot = z.object({
	time: z.coerce.date(),
	parent: z.string().optional(),
	tree: z.string(),
	paths: z.string().array(),
	hostname: z.string(),
	username: z.string(),
	uid: z.number().int().nonnegative(),
	gid: z.number().int().nonnegative(),
	excludes: z.string().array().optional(),
	tags: z.string().array().optional(),
	program_version: z.string(),
	summary: snapshotSummary,
	id: z.string(),
	short_id: z.string()
});
const snapshotsMessage = z.array(snapshot);

//#endregion
//#region src/commands/forget.ts
const baseForgetArgs = z.object({
	...baseArgs.shape,
	dryRun: z.coerce.boolean(),
	prune: z.coerce.boolean(),
	maxUnused: z.string().optional(),
	maxRepackSize: z.string().regex(/^\d+(?:\.\d+)?[kKmMgGtT]$/).optional(),
	repackCacheableOnly: z.coerce.boolean(),
	repackSmall: z.coerce.boolean(),
	repackUncompressed: z.coerce.boolean(),
	repackSmallerThan: z.string().regex(/^\d+(?:\.\d+)?[kKmM]$/).optional()
});
const allForgetArgs = z.object({
	...baseForgetArgs.shape,
	...commonFilterArgs.shape,
	...commonGroupBy.shape,
	keepLast: z.number().optional(),
	keepHourly: z.string().optional(),
	keepDaily: z.string().optional(),
	keepWeekly: z.string().optional(),
	keepMonthly: z.string().optional(),
	keepYearly: z.string().optional(),
	keepWithin: z.string().optional(),
	keepWithinHourly: z.string().optional(),
	keepWithinDaily: z.string().optional(),
	keepWithinWeekly: z.string().optional(),
	keepWithinMonthly: z.string().optional(),
	keepWithinYearly: z.string().optional(),
	keepTag: z.string().array().default([]),
	unsafeAllowRemoveAll: z.coerce.boolean()
});
var ForgetArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(allForgetArgs);
	}
	#snapshots = [];
	snapshot(...snapshots$1) {
		this.#snapshots.push(...snapshots$1);
		return this;
	}
	command() {
		return "forget";
	}
	toArgs() {
		return [...super.toArgs(), ...this.#snapshots];
	}
	format() {
		return this.#snapshots.length > 0 ? "none" : "json";
	}
	parse(data) {
		return forgetMessage.parse(data);
	}
};
/**
* Remove snapshots according to given policy.
*
* ```typescript
* const results = await forget()
*   .repository(..)
*   .password(..)
*   .keepLast(5)
*   .run();
* ```
*/
function forget() {
	return new ForgetArgumentBuilder();
}
const keepReasons = z.array(z.object({
	snapshot,
	matches: z.string().array()
}));
const forgetMessage = z.array(z.object({
	tags: z.string().array().nullable(),
	host: z.string(),
	paths: z.string().array(),
	keep: snapshot.array(),
	remove: snapshot.array(),
	reasons: keepReasons
}));

//#endregion
//#region src/commands/init.ts
const initArgs = z.object({
	...baseArgs.shape,
	copyChunkerParams: z.coerce.boolean(),
	fromInsecureNoPassword: z.coerce.boolean(),
	fromPasswordCommand: z.string().optional(),
	fromPasswordFile: z.string().optional(),
	fromRepo: z.string().optional(),
	fromRepositoryFile: z.string().optional(),
	repositoryVersion: z.enum(["latest", "stable"]).optional()
});
var InitArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(initArgs);
	}
	command() {
		return "init";
	}
	format() {
		return "json";
	}
	parse(data) {
		return initMessage.parse(data);
	}
};
/**
* Initialise a new repository
*
* ```typescript
* await init()
*   .repository(..)
*   .password(..)
* ```
*/
function init() {
	return new InitArgumentBuilder();
}
const initMessage = z.object({
	message_type: z.literal("initialized"),
	id: z.string(),
	repository: z.string()
});

//#endregion
//#region src/commands/keyList.ts
var KeyListArgumentBuilder = class extends RepositoryArgumentBuilder {
	command() {
		return "list";
	}
	toArgs() {
		return ["key", ...super.toArgs()];
	}
	format() {
		return "json";
	}
	parse(data) {
		return keyListMessage.parse(data);
	}
};
/**
* List all keys (passwords) associated with the repository
*
* ```typescript
* const keys = await keyList()
*   .repository(..)
*   .password(..);
* ```
*/
function keyList() {
	return new KeyListArgumentBuilder();
}
const keyListMessage = z.array(z.object({
	current: z.boolean(),
	id: z.string(),
	userName: z.string(),
	hostName: z.string(),
	created: z.coerce.date()
}));

//#endregion
//#region src/commands/ls.ts
const lsArgs = z.object({
	...baseArgs.shape,
	host: commonFilterArgs.shape.host,
	path: commonFilterArgs.shape.path,
	tag: commonFilterArgs.shape.tag,
	recursive: z.coerce.boolean(),
	reverse: z.coerce.boolean(),
	sort: z.enum([
		"name",
		"size",
		"time",
		"mtime",
		"atime",
		"ctime",
		"extension"
	]).optional()
});
var LsArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(lsArgs);
	}
	#directories = [];
	/**
	* Select directory/directories to filter by
	*/
	directory(...path) {
		this.#directories.push(...path);
		return this;
	}
	#snapshot;
	/**
	* Select snapshot to list
	*/
	snapshot(snapshotId) {
		this.#snapshot = snapshotId;
		return this;
	}
	/**
	* Use latest snapshot
	*/
	latest() {
		this.#snapshot = "latest";
		return this;
	}
	command() {
		return "ls";
	}
	toArgs() {
		return [
			...super.toArgs(),
			this.#snapshot,
			...this.#directories
		];
	}
	parse(data) {
		return lsMessage.parse(data);
	}
	validate() {
		super.validate();
		if (!this.#snapshot) throw new MissingSnapshotError();
	}
};
/**
* List files in a snapshot.
*
* ```typescript
* await ls()
*   .repository(..)
*   .password(..)
*   .snapshot(..)
*   .run();
* ```
*/
function ls() {
	return new LsArgumentBuilder();
}
const snapshotMessage = z.object({
	message_type: z.literal("snapshot"),
	struct_type: z.literal("snapshot"),
	...snapshot.shape
});
const nodeMessage = z.object({
	message_type: z.literal("node"),
	struct_type: z.literal("node"),
	name: z.string(),
	type: z.string(),
	path: z.string(),
	uid: z.number().int().nonnegative(),
	gid: z.number().int().nonnegative(),
	size: z.number().int().nonnegative().optional(),
	mode: z.number().int().nonnegative(),
	permissions: z.string(),
	atime: z.coerce.date(),
	mtime: z.coerce.date(),
	ctime: z.coerce.date(),
	inode: z.number().int().nonnegative()
});
const lsMessage = z.union([snapshotMessage, nodeMessage]);

//#endregion
//#region src/commands/restore.ts
const restoreArgs = z.object({
	...baseArgs.shape,
	...commonFilterArgs.shape,
	delete: z.coerce.boolean(),
	dryRun: z.coerce.boolean(),
	exclude: z.string().array().default([]),
	excludeFile: z.string().array().default([]),
	excludeXattr: z.string().array().default([]),
	iexcludePattern: z.coerce.string().array().default([]),
	iexcludeFile: z.coerce.string().array().default([]),
	iincludePattern: z.coerce.string().array().default([]),
	iincludeFile: z.coerce.string().array().default([]),
	include: z.string().array().default([]),
	includeFile: z.string().array().default([]),
	includeXattr: z.string().array().default([]),
	overwrite: z.enum([
		"always",
		"if-changed",
		"if-newer",
		"never"
	]).optional(),
	sparse: z.coerce.boolean(),
	target: z.string().array().min(1),
	verify: z.coerce.boolean()
});
var RestoreArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(restoreArgs);
	}
	#snapshot;
	snapshot(snapshot$1) {
		this.#snapshot = snapshot$1;
		return this;
	}
	command() {
		return "restore";
	}
	format() {
		return "jsonlines-no-log";
	}
	toArgs() {
		return [...super.toArgs(), this.#snapshot];
	}
	parse(data) {
		return restoreMessage.parse(data);
	}
	validate() {
		super.validate();
		if (!this.#snapshot) throw new MissingSnapshotError();
	}
};
/**
* Create a new snapshot saving given files and arguments
*
* ```typescript
* await restore()
*   .repository(..)
*   .password(..)
*   .snapshot(..)
*   .target(..);
* ```
*/
function restore() {
	return new RestoreArgumentBuilder();
}
const restoreStatusMessage = z.object({
	message_type: z.literal("status"),
	seconds_elapsed: z.number().int().nonnegative().optional(),
	percent_done: z.number(),
	total_files: z.number().int().nonnegative().optional(),
	files_restored: z.number().int().nonnegative().optional(),
	files_skipped: z.number().int().nonnegative().optional(),
	files_deleted: z.number().int().nonnegative().optional(),
	total_bytes: z.number().int().nonnegative().optional(),
	bytes_restored: z.number().int().nonnegative().optional(),
	bytes_skipped: z.number().int().nonnegative().optional()
});
const restoreVerboseStatusMessage = z.object({
	message_type: z.literal("verbose_status"),
	action: z.enum([
		"restored",
		"updated",
		"unchanged",
		"deleted"
	]),
	item: z.string(),
	size: z.number().int().nonnegative()
});
const restoreSummaryMessage = z.object({
	message_type: z.literal("summary"),
	seconds_elapsed: z.number().int().nonnegative().optional(),
	total_files: z.number().int().nonnegative().optional(),
	files_restored: z.number().int().nonnegative().optional(),
	files_skipped: z.number().int().nonnegative().optional(),
	files_deleted: z.number().int().nonnegative().optional(),
	total_bytes: z.number().int().nonnegative().optional(),
	bytes_restored: z.number().int().nonnegative().optional(),
	bytes_skipped: z.number().int().nonnegative().optional()
});
const restoreMessage = z.union([
	restoreStatusMessage,
	restoreVerboseStatusMessage,
	restoreSummaryMessage
]);

//#endregion
//#region src/commands/stats.ts
const statsArgs = z.object({
	...baseArgs.shape,
	...commonFilterArgs.shape
});
var StatsArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(statsArgs);
	}
	#snapshots = [];
	/**
	* Select snapshot(s) to generate stats for
	*/
	snapshot(...snapshots$1) {
		this.#snapshots.push(...snapshots$1);
		return this;
	}
	#mode = "restore-size";
	/**
	* Set counting mode to restore size
	*/
	modeRestoreSize() {
		this.#mode = "restore-size";
		return this;
	}
	/**
	* Set counting mode to files by content
	*/
	modeFilesByContents() {
		this.#mode = "files-by-contents";
		return this;
	}
	/**
	* Set counting mode to blobs per file
	*/
	modeBlobsPerFile() {
		this.#mode = "blobs-per-file";
		return this;
	}
	/**
	* Set counting mode to raw data
	*/
	modeRawData() {
		this.#mode = "raw-data";
		return this;
	}
	command() {
		return "stats";
	}
	toArgs() {
		return [
			...super.toArgs(),
			"--mode",
			this.#mode,
			...this.#snapshots
		];
	}
	format() {
		return "json";
	}
	parse(data) {
		switch (this.#mode) {
			case "restore-size": return restoreSizeMessage.parse(data);
			case "files-by-contents": return filesByContentsMessage.parse(data);
			case "blobs-per-file": return blobsPerFileMessage.parse(data);
			case "raw-data": return rawDataMessage.parse(data);
		}
	}
};
/**
* Walk one or more snapshots in a repository to accumulate statistics
*
* ```typescript
* const stats = await stats()
*   .repository(..)
*   .password(..)
*   .snapshot(..);
* ```
*/
function stats() {
	return new StatsArgumentBuilder();
}
const restoreSizeMessage = z.object({
	snapshots_count: z.number().int().nonnegative(),
	total_file_count: z.number().int().nonnegative().optional(),
	total_size: z.number().int().nonnegative()
});
const filesByContentsMessage = z.object({
	snapshots_count: z.number().int().nonnegative(),
	total_file_count: z.number().int().nonnegative().optional(),
	total_size: z.number().int().nonnegative()
});
const blobsPerFileMessage = z.object({
	snapshots_count: z.number().int().nonnegative(),
	total_blob_count: z.number().int().nonnegative().optional(),
	total_file_count: z.number().int().nonnegative().optional(),
	total_size: z.number().int().nonnegative()
});
const rawDataMessage = z.object({
	compression_progress: z.number().optional(),
	compression_ratio: z.number().optional(),
	compression_space_saving: z.number().optional(),
	snapshots_count: z.number().int().nonnegative(),
	total_blob_count: z.number().int().nonnegative().optional(),
	total_size: z.number().int().nonnegative(),
	total_uncompressed_size: z.number().int().nonnegative().optional()
});

//#endregion
//#region src/commands/tag.ts
const tagArgs = z.object({
	...baseArgs.shape,
	...commonFilterArgs.shape,
	add: z.string().array().default([]),
	remove: z.string().array().default([]),
	set: z.string().array().default([])
});
var TagArgumentBuilder = class extends RepositoryArgumentBuilder {
	constructor() {
		super(tagArgs);
	}
	#snapshots = [];
	snapshot(...snapshots$1) {
		this.#snapshots.push(...snapshots$1);
		return this;
	}
	command() {
		return "tag";
	}
	setFilter(line) {
		return line !== "create exclusive lock for repository";
	}
	toArgs() {
		return [...super.toArgs(), ...this.#snapshots];
	}
	parse(data) {
		return tagMessage.parse(data);
	}
};
/**
* Modify tags on existing snapshots
*
* ```typescript
* await tag()
*   .repository(..)
*   .password(..)
*   .set('my', 'tag')
*   .snapshot(..)
*   .run();
* ```
*/
function tag() {
	return new TagArgumentBuilder();
}
const changedMessage = z.object({
	message_type: z.literal("changed"),
	old_snapshot_id: z.string(),
	new_snapshot_id: z.string()
});
const summaryMessage = z.object({
	message_type: z.literal("summary"),
	changed_snapshots: z.number().int()
});
const tagMessage = z.union([changedMessage, summaryMessage]);

//#endregion
//#region src/commands/version.ts
var VersionArgumentBuilder = class extends ArgumentBuilder {
	command() {
		return "version";
	}
	format() {
		return "json";
	}
	parse(data) {
		return versionMessage.parse(data);
	}
};
/**
* Get version information about restic
*
* ```typescript
* const restic = await version();
* ```
*/
async function version() {
	return await new VersionArgumentBuilder().run();
}
const versionMessage = z.object({
	message_type: z.literal("version"),
	version: z.string(),
	go_version: z.string(),
	go_os: z.string(),
	go_arch: z.string()
});

//#endregion
export { MissingCompareError, MissingFilesError, MissingMatchError, MissingPasswordError, MissingRepositoryError, MissingSnapshotError, MissingTargetError, ResticBackupCommandCouldNotReadSourceDataError, ResticCommandFailedError, ResticFailedToLockRepositoryError, ResticGoRuntimeError, ResticInterruptedError, ResticRepositoryDoesNotExistError, ResticUnknownError, ResticWrongPasswordError, backup, cat, check, diff, find, forget, init, keyList, ls, restore, snapshots, stats, tag, version };
//# sourceMappingURL=index.js.map