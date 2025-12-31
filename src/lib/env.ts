import { z } from "zod"

export { env }

let envSchema = z.object({
	VITE_JAZZ_SYNC_SERVER: z.string().startsWith("wss://"),
})

let env = envSchema.parse({
	VITE_JAZZ_SYNC_SERVER: import.meta.env.VITE_JAZZ_SYNC_SERVER,
})
