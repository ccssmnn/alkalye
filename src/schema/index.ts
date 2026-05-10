import { Group, co, z } from "jazz-tools"
import { Theme } from "@/app/features/themes/lib/schema"
import {
	Settings,
	DEFAULT_EDITOR_SETTINGS,
} from "@/app/features/settings/lib/schema"
import { getRandomWriterName } from "@/app/features/onboarding/lib/random-writer-name"
import {
	fetchWelcomeContent,
	getSpaceWelcomeContent,
} from "@/app/features/onboarding/lib/welcome-content"

export {
	ImageAsset,
	VideoAsset,
	Asset,
	Document,
	Space,
	UserProfile,
	UserRoot,
	UserAccount,
	CursorEntry,
	CursorFeed,
	createSpace,
	createSpaceDocument,
}

export { migrateAnonymousData } from "@/app/features/auth/lib/migrate-anonymous-data"

export { getRandomWriterName } from "@/app/features/onboarding/lib/random-writer-name"

export {
	Settings,
	EditorSettings,
	DEFAULT_EDITOR_SETTINGS,
} from "@/app/features/settings/lib/schema"

export {
	Theme,
	ThemeAsset,
	ThemePreset,
	ThemeType,
} from "@/app/features/themes/lib/schema"

let CursorEntry = z.object({
	position: z.number(),
	selectionEnd: z.number().optional(),
})

let CursorFeed = co.feed(CursorEntry)

let ImageAsset = co.map({
	type: z.literal("image"),
	name: z.string(),
	image: co.image(),
	createdAt: z.date(),
})

let VideoAsset = co.map({
	type: z.literal("video"),
	name: z.string(),
	video: co.fileStream(),
	mimeType: z.string(),
	muteAudio: z.boolean().optional(),
	createdAt: z.date(),
})

let Asset = co.discriminatedUnion("type", [ImageAsset, VideoAsset])

let HighlightRange = z.object({
	// 0-indexed character offset in the full document content
	start: z.number(),
	end: z.number(),
})

let Document = co.map({
	version: z.literal(1),
	content: co.plainText(),
	assets: co.optional(co.list(Asset)),
	cursors: co.optional(CursorFeed),
	deletedAt: z.date().optional(),
	presentationLine: z.number().optional(),
	highlightRange: HighlightRange.optional(),
	spaceId: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
})

let Space = co.map({
	name: z.string(),
	avatar: co.optional(co.image()),
	documents: co.list(Document),
	createdAt: z.date(),
	updatedAt: z.date(),
})

let UserProfile = co.profile({
	name: z.string(),
})

let UserRoot = co.map({
	documents: co.list(Document),
	inactiveDocuments: co.optional(co.list(Document)),
	spaces: co.optional(co.list(Space)),
	settings: co.optional(Settings),
	themes: co.optional(co.list(Theme)),
	migrationVersion: z.number().optional(),
	lastOpenedDocId: z.string().optional(),
	lastOpenedSpaceId: z.string().optional(),
})

let UserAccount = co
	.account({
		profile: UserProfile,
		root: UserRoot,
	})
	.withMigration(async (account, creationProps?: { name: string }) => {
		if (!account.$jazz.has("root")) {
			let root = UserRoot.create({
				documents: co.list(Document).create([]),
				migrationVersion: 1,
			})
			account.$jazz.set("root", root)
		}

		let { root } = await account.$jazz.ensureLoaded({
			resolve: { root: true },
		})

		// Initialize documents list if not present
		if (root && !root.$jazz.has("documents")) {
			root.$jazz.set("documents", co.list(Document).create([]))
		}

		// Re-load with documents to check if welcome doc needed
		let { root: rootWithDocs } = await account.$jazz.ensureLoaded({
			resolve: { root: { documents: true } },
		})

		// Create welcome doc for new accounts with no documents
		if (
			rootWithDocs?.documents?.$isLoaded &&
			rootWithDocs.documents.length === 0
		) {
			let welcomeContent = await fetchWelcomeContent()
			let now = new Date()
			let group = Group.create()
			let welcomeDoc = Document.create(
				{
					version: 1,
					content: co.plainText().create(welcomeContent, group),
					createdAt: now,
					updatedAt: now,
				},
				group,
			)
			rootWithDocs.documents.$jazz.push(welcomeDoc)
		}

		// Initialize settings with defaults if not present
		if (root && !root.$jazz.has("settings")) {
			root.$jazz.set(
				"settings",
				Settings.create({ editor: DEFAULT_EDITOR_SETTINGS }, root.$jazz.owner),
			)
		}

		// Initialize empty spaces list if not present
		if (root && !root.$jazz.has("spaces")) {
			root.$jazz.set("spaces", co.list(Space).create([], root.$jazz.owner))
		}

		// Initialize inactive documents list if not present
		if (root && !root.$jazz.has("inactiveDocuments")) {
			root.$jazz.set(
				"inactiveDocuments",
				co.list(Document).create([], root.$jazz.owner),
			)
		}

		// Initialize empty themes list if not present
		if (root && !root.$jazz.has("themes")) {
			root.$jazz.set("themes", co.list(Theme).create([], root.$jazz.owner))
		}

		if (!account.$jazz.has("profile")) {
			let profileGroup = Group.create()
			profileGroup.makePublic()
			account.$jazz.set(
				"profile",
				UserProfile.create(
					{ name: creationProps?.name ?? getRandomWriterName() },
					profileGroup,
				),
			)
		}
	})

function createSpace(
	name: string,
	userRoot: co.loaded<typeof UserRoot, { spaces: true }>,
): co.loaded<typeof Space> {
	let group = Group.create()
	let now = new Date()

	// Welcome doc is created without spaceId (space.$jazz.id isn't known yet);
	// it's set right after space creation below.
	let welcomeContent = getSpaceWelcomeContent(name)
	let welcomeDoc = createSpaceDocument(group, undefined, welcomeContent)

	let space = Space.create(
		{
			name,
			documents: co.list(Document).create([welcomeDoc], group),
			createdAt: now,
			updatedAt: now,
		},
		group,
	)

	welcomeDoc.$jazz.set("spaceId", space.$jazz.id)

	if (!userRoot.spaces) {
		userRoot.$jazz.set(
			"spaces",
			co.list(Space).create([], userRoot.$jazz.owner),
		)
	}
	userRoot.spaces!.$jazz.push(space)

	return space
}

function createSpaceDocument(
	spaceGroup: Group,
	spaceId: string | undefined,
	content: string = "",
): co.loaded<typeof Document, { content: true }> {
	// Create a document-specific group with space group as parent (no role = inherit)
	// Space members inherit their space role: reader→reader, writer→writer, admin→admin
	// Doc-level invites go to docGroup, not spaceGroup (so they don't grant space access)
	let docGroup = Group.create()
	docGroup.addMember(spaceGroup)

	let now = new Date()
	let doc = Document.create(
		{
			version: 1,
			content: co.plainText().create(content, docGroup),
			spaceId,
			createdAt: now,
			updatedAt: now,
		},
		docGroup,
	)

	return doc as co.loaded<typeof Document, { content: true }>
}
