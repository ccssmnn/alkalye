import { describe, expect, test } from "vitest"
import {
	buildDocumentPublicLink,
	buildSpaceInviteLink,
	buildSpacePublicLink,
} from "@/lib/invite-links"

describe("invite link helpers", () => {
	test("buildSpacePublicLink matches the app router", () => {
		expect(buildSpacePublicLink("https://alkalye.com/", "space_123")).toBe(
			"https://alkalye.com/spaces/space_123",
		)
	})

	test("buildDocumentPublicLink trims trailing slash", () => {
		expect(buildDocumentPublicLink("https://alkalye.com/", "doc_123")).toBe(
			"https://alkalye.com/doc/doc_123",
		)
	})

	test("buildSpaceInviteLink trims trailing slash", () => {
		expect(
			buildSpaceInviteLink({
				baseUrl: "https://alkalye.com/",
				spaceId: "space_123",
				inviteGroupId: "group_123",
				inviteSecret: "inviteSecret_z123",
			}),
		).toBe(
			"https://alkalye.com/invite#/space/space_123/invite/group_123/inviteSecret_z123",
		)
	})
})
