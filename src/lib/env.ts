import { z } from "zod"

export { env }

let envSchema = z.object({
	VITE_JAZZ_SYNC_SERVER: z
		.string()
		.startsWith("wss://")
		.or(z.string().startsWith("ws://")),
})

let env = envSchema.parse({
	VITE_JAZZ_SYNC_SERVER: import.meta.env.VITE_JAZZ_SYNC_SERVER,
})
