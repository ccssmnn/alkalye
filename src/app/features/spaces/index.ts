export { Space } from "./lib/schema"
export { createSpace } from "./lib/create-space"
export {
	createSpaceInvite,
	acceptSpaceInvite,
	revokeSpaceInvite,
	listSpaceCollaborators,
	listSpaceMembers,
	leaveSpace,
	changeSpaceCollaboratorRole,
	parseSpaceInviteLink,
	getSpaceOwner,
	isSpacePublic,
	isSpaceMember,
	makeSpacePublic,
	makeSpacePrivate,
	permanentlyDeleteSpace,
	getSpaceGroup,
} from "./lib/spaces"
export type {
	SpaceInviteData,
	SpaceCollaborator,
	SpaceMember,
	SpaceCollaboratorsResult,
	SpaceInviteResult,
} from "./lib/spaces"
export { SpaceSelector, SpaceInitials } from "./widgets/space-selector"
export {
	MoveToSpaceDialog,
	type MoveToSpaceDialogProps,
} from "./widgets/move-to-space-dialog"
export {
	CopyToSyncedDialog,
	type CopyToSyncedDialogProps,
} from "./widgets/copy-to-synced-dialog"
export {
	SpaceListScreen,
	spaceListLoader,
	spaceListResolve,
} from "./screens/space-list-screen"
export {
	SpaceSettingsScreen,
	spaceSettingsResolve,
} from "./screens/space-settings-screen"
