import { Group, co, z } from "jazz-tools"
import { Theme } from "@/app/features/themes/lib/schema"
import {
	Settings,
	DEFAULT_EDITOR_SETTINGS,
} from "@/app/features/settings/lib/schema"
import { getRandomWriterName } from "@/app/features/onboarding/lib/random-writer-name"
import { fetchWelcomeContent } from "@/app/features/onboarding/lib/welcome-content"
import { ImageAsset, VideoAsset, Asset } from "@/app/features/assets/lib/schema"
import { Document } from "@/app/features/documents/lib/schema"
import { Space } from "@/app/features/spaces/lib/schema"

export {
	ImageAsset,
	VideoAsset,
	Asset,
	Space,
	UserProfile,
	UserRoot,
	UserAccount,
}

export {
	Document,
	CursorEntry,
	CursorFeed,
} from "@/app/features/documents/lib/schema"
export { createSpaceDocument } from "@/app/features/documents/lib/create-space-document"

export { createSpace } from "@/app/features/spaces/lib/create-space"

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
