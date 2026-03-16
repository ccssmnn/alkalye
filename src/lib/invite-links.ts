export {
	buildDocumentInviteLink,
	buildSpaceInviteLink,
	buildDocumentPublicLink,
	buildSpacePublicLink,
}

function buildDocumentInviteLink(args: {
	baseUrl: string
	docId: string
	inviteGroupId: string
	inviteSecret: string
}): string {
	let baseUrl = trimTrailingSlash(args.baseUrl)
	return `${baseUrl}/invite#/doc/${args.docId}/invite/${args.inviteGroupId}/${args.inviteSecret}`
}

function buildSpaceInviteLink(args: {
	baseUrl: string
	spaceId: string
	inviteGroupId: string
	inviteSecret: string
}): string {
	let baseUrl = trimTrailingSlash(args.baseUrl)
	return `${baseUrl}/invite#/space/${args.spaceId}/invite/${args.inviteGroupId}/${args.inviteSecret}`
}

function buildDocumentPublicLink(baseUrl: string, docId: string): string {
	return `${trimTrailingSlash(baseUrl)}/doc/${docId}`
}

function buildSpacePublicLink(baseUrl: string, spaceId: string): string {
	return `${trimTrailingSlash(baseUrl)}/app/spaces/${spaceId}`
}

function trimTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value
}
