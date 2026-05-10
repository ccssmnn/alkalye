import { Group, co } from "jazz-tools"
import { Document } from "@/schema/document"
import { Space } from "./schema"
import { createSpaceDocument, type UserRoot } from "@/schema"
import { getSpaceWelcomeContent } from "@/app/features/onboarding/lib/welcome-content"

export { createSpace }

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
