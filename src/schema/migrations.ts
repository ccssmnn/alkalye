import { Group, co } from "jazz-tools"
import { Theme } from "@/app/features/themes/lib/schema"
import {
	Settings,
	DEFAULT_EDITOR_SETTINGS,
} from "@/app/features/settings/lib/schema"
import { getRandomWriterName } from "@/app/features/onboarding/lib/random-writer-name"
import { fetchWelcomeContent } from "@/app/features/onboarding/lib/welcome-content"
import { Document } from "@/app/features/documents/lib/schema"
import { Space } from "@/app/features/spaces/lib/schema"
import { UserRoot, UserProfile, type UserAccount } from "@/schema"

export { runAccountMigration }

async function runAccountMigration(
	account: co.loaded<typeof UserAccount>,
	creationProps?: { name: string },
) {
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

	if (root && !root.$jazz.has("documents")) {
		root.$jazz.set("documents", co.list(Document).create([]))
	}

	let { root: rootWithDocs } = await account.$jazz.ensureLoaded({
		resolve: { root: { documents: true } },
	})

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

	if (root && !root.$jazz.has("settings")) {
		root.$jazz.set(
			"settings",
			Settings.create({ editor: DEFAULT_EDITOR_SETTINGS }, root.$jazz.owner),
		)
	}

	if (root && !root.$jazz.has("spaces")) {
		root.$jazz.set("spaces", co.list(Space).create([], root.$jazz.owner))
	}

	if (root && !root.$jazz.has("inactiveDocuments")) {
		root.$jazz.set(
			"inactiveDocuments",
			co.list(Document).create([], root.$jazz.owner),
		)
	}

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
}
