import type { APIRoute } from "astro"
import { PUBLIC_JAZZ_SYNC_SERVER } from "astro:env/client"

export { GET }

let GET: APIRoute = ({ request }) => {
	let url = new URL(request.url)
	let baseUrl = `${url.protocol}//${url.host}`

	return new Response(
		JSON.stringify({
			baseUrl,
			syncPeer: PUBLIC_JAZZ_SYNC_SERVER,
		}),
		{
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "public, max-age=300",
			},
		},
	)
}
