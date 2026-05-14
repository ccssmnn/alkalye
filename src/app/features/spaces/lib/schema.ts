import { co, z } from "jazz-tools"
import { Document } from "@/app/features/documents/lib/schema"

export { Space }

let Space = co.map({
	name: z.string(),
	avatar: co.optional(co.image()),
	documents: co.list(Document),
	createdAt: z.date(),
	updatedAt: z.date(),
})
