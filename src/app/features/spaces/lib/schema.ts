import { co, z } from "jazz-tools"
import { Document } from "@/schema/document"

export { Space }

let Space = co.map({
	name: z.string(),
	avatar: co.optional(co.image()),
	documents: co.list(Document),
	createdAt: z.date(),
	updatedAt: z.date(),
})
