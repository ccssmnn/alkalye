import { Group, co, z } from "jazz-tools"

export {
	Asset,
	Document,
	Space,
	UserProfile,
	UserRoot,
	UserAccount,
	Settings,
	EditorSettings,
	DEFAULT_EDITOR_SETTINGS,
	migrateAnonymousData,
	CursorEntry,
	CursorFeed,
	getRandomWriterName,
	createSpace,
	createSpaceDocument,
	deleteSpace,
}

let CursorEntry = z.object({
	position: z.number(),
	selectionEnd: z.number().optional(),
})

let CursorFeed = co.feed(CursorEntry)

let EditorSettings = z.object({
	lineWidth: z.number(),
	lineHeight: z.number(),
	letterSpacing: z.number(),
	fontSize: z.number(),
	strikethroughDoneTasks: z.boolean(),
	fadeDoneTasks: z.boolean(),
	highlightCurrentLine: z.boolean(),
})

let DEFAULT_EDITOR_SETTINGS: z.infer<typeof EditorSettings> = {
	lineWidth: 65,
	lineHeight: 1.8,
	letterSpacing: 0,
	fontSize: 18,
	strikethroughDoneTasks: false,
	fadeDoneTasks: false,
	highlightCurrentLine: true,
}

let Settings = co.map({
	editor: EditorSettings,
})

let Asset = co.map({
	type: z.literal("image"),
	name: z.string(),
	image: co.image(),
	createdAt: z.date(),
})

let Document = co.map({
	version: z.literal(1),
	content: co.plainText(),
	assets: co.optional(co.list(Asset)),
	cursors: co.optional(CursorFeed),
	deletedAt: z.date().optional(),
	permanentlyDeletedAt: z.date().optional(),
	presentationLine: z.number().optional(),
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
	deletedAt: z.date().optional(),
})

let UserProfile = co.profile({
	name: z.string(),
})

let UserRoot = co.map({
	documents: co.list(Document),
	inactiveDocuments: co.optional(co.list(Document)),
	spaces: co.optional(co.list(Space)),
	settings: co.optional(Settings),
	migrationVersion: z.number().optional(),
})

let FALLBACK_WELCOME_CONTENT = `# Welcome to Alkalye

A beautiful markdown editor. Private by design.

Your words are end-to-end encrypted. Collaborate in real-time. Works on any device.

**Get started:** Edit this document, create a new one, or open a tutor from the Help menu.
`

function getSpaceWelcomeContent(spaceName: string): string {
	return `# Welcome to ${spaceName}

This is your new shared space. Documents here are shared with all space members.

**Get started:** Edit this document or create a new one.
`
}

async function fetchWelcomeContent(): Promise<string> {
	try {
		let response = await fetch("/docs/welcome.md")
		if (!response.ok) return FALLBACK_WELCOME_CONTENT
		return await response.text()
	} catch {
		return FALLBACK_WELCOME_CONTENT
	}
}

function isWelcomeDoc(content: string): boolean {
	return content.startsWith("# Welcome to Alkalye")
}

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
			resolve: { root: { documents: true } },
		})
		if (root && !root.$jazz.has("documents")) {
			root.$jazz.set("documents", co.list(Document).create([]))
		}

		// Create welcome doc for new accounts with no documents
		if (root?.documents?.$isLoaded && root.documents.length === 0) {
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
			root.documents.$jazz.push(welcomeDoc)
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

let adjectives = [
	"Wandering",
	"Dreaming",
	"Curious",
	"Pensive",
	"Restless",
	"Eloquent",
	"Brooding",
	"Whimsical",
	"Melancholy",
	"Luminous",
	"Wistful",
	"Serene",
	"Fierce",
	"Gentle",
	"Bold",
	"Quiet",
	"Wild",
	"Tender",
	"Radiant",
	"Somber",
]

let writerNames = [
	"Hemingway",
	"Woolf",
	"Borges",
	"Austen",
	"Kafka",
	"Tolstoy",
	"Dickinson",
	"Márquez",
	"Plath",
	"Orwell",
	"Dostoevsky",
	"Brontë",
	"Neruda",
	"Camus",
	"Sappho",
	"Rumi",
	"Murasaki",
	"Cervantes",
	"Poe",
	"Whitman",
	"Yeats",
	"Rilke",
	"Tagore",
	"Pessoa",
	"Lispector",
	"Baldwin",
	"Achebe",
	"Atwood",
	"Morrison",
	"Rushdie",
]

function getRandomWriterName(): string {
	let adjIndex = Math.floor(Math.random() * adjectives.length)
	let nameIndex = Math.floor(Math.random() * writerNames.length)
	return `${adjectives[adjIndex]} ${writerNames[nameIndex]}`
}

function createSpace(
	name: string,
	userRoot: co.loaded<typeof UserRoot, { spaces: true }>,
): co.loaded<typeof Space> {
	let group = Group.create()
	let now = new Date()

	// Create welcome document with its own group (space group as admin)
	let welcomeContent = getSpaceWelcomeContent(name)
	let welcomeDoc = createSpaceDocument(group, welcomeContent)

	let space = Space.create(
		{
			name,
			documents: co.list(Document).create([welcomeDoc], group),
			createdAt: now,
			updatedAt: now,
		},
		group,
	)

	if (!userRoot.spaces) {
		userRoot.$jazz.set(
			"spaces",
			co.list(Space).create([], userRoot.$jazz.owner),
		)
	}
	userRoot.spaces!.$jazz.push(space)

	return space
}

function deleteSpace(space: co.loaded<typeof Space>): void {
	space.$jazz.set("deletedAt", new Date())
	space.$jazz.set("updatedAt", new Date())
}

function createSpaceDocument(
	spaceGroup: Group,
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
			createdAt: now,
			updatedAt: now,
		},
		docGroup,
	)

	return doc as co.loaded<typeof Document, { content: true }>
}

async function migrateAnonymousData(
	anonymousAccount: co.loaded<typeof UserAccount>,
) {
	let { root: anonRoot } = await anonymousAccount.$jazz.ensureLoaded({
		resolve: {
			root: {
				documents: { $each: { content: true } },
				inactiveDocuments: { $each: { content: true } },
			},
		},
	})

	if (!anonRoot) return

	let me = await UserAccount.getMe().$jazz.ensureLoaded({
		resolve: {
			root: {
				documents: true,
				inactiveDocuments: true,
			},
		},
	})

	if (!me.root) return

	for (let doc of Array.from(anonRoot.documents ?? [])) {
		if (!doc?.$isLoaded) continue
		// Skip unaltered welcome docs - new account already has one
		if (isWelcomeDoc(doc.content?.toString() ?? "")) continue
		let docGroup = doc.$jazz.owner
		if (docGroup instanceof Group) {
			docGroup.addMember(me, "admin")
		}
		me.root.documents.$jazz.push(doc)
	}

	for (let doc of Array.from(anonRoot.inactiveDocuments ?? [])) {
		if (!doc?.$isLoaded) continue
		// Skip unaltered welcome docs
		if (isWelcomeDoc(doc.content?.toString() ?? "")) continue
		let docGroup = doc.$jazz.owner
		if (docGroup instanceof Group) {
			docGroup.addMember(me, "admin")
		}
		if (!me.root.inactiveDocuments) {
			me.root.$jazz.set(
				"inactiveDocuments",
				co.list(Document).create([], me.root.$jazz.owner),
			)
		}
		me.root.inactiveDocuments!.$jazz.push(doc)
	}
}
