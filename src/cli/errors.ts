import { Data } from "effect"

export {
	CliUsageError,
	AuthError,
	ConfigError,
	SyncPeerError,
	NotFoundError,
	PermissionError,
	ValidationError,
	FilesystemError,
	UnexpectedCliError,
	getExitCode,
}

class CliUsageError extends Data.TaggedError("CliUsageError")<{
	message: string
}> {}

class AuthError extends Data.TaggedError("AuthError")<{
	message: string
}> {}

class ConfigError extends Data.TaggedError("ConfigError")<{
	message: string
}> {}

class SyncPeerError extends Data.TaggedError("SyncPeerError")<{
	message: string
}> {}

class NotFoundError extends Data.TaggedError("NotFoundError")<{
	message: string
}> {}

class PermissionError extends Data.TaggedError("PermissionError")<{
	message: string
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
	message: string
}> {}

class FilesystemError extends Data.TaggedError("FilesystemError")<{
	message: string
}> {}

class UnexpectedCliError extends Data.TaggedError("UnexpectedCliError")<{
	message: string
}> {}

function getExitCode(error: unknown): number {
	if (hasTag(error, "CliUsageError") || hasTag(error, "ValidationError"))
		return 2
	if (hasTag(error, "AuthError")) return 3
	if (hasTag(error, "NotFoundError")) return 4
	if (hasTag(error, "PermissionError")) return 5
	if (hasTag(error, "SyncPeerError")) return 6
	if (hasTag(error, "FilesystemError") || hasTag(error, "ConfigError")) return 7
	return 1
}

function hasTag(error: unknown, tag: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"_tag" in error &&
		error._tag === tag
	)
}
