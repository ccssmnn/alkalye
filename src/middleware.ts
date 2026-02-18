import { defineMiddleware } from "astro:middleware"

export let onRequest = defineMiddleware((context, next) => {
	let isAppDeepLink =
		context.request.method === "GET" &&
		context.url.pathname.startsWith("/app/") &&
		context.url.pathname !== "/app/" &&
		!context.url.pathname.includes(".")

	if (isAppDeepLink) {
		return context.rewrite("/app/")
	}

	return next()
})
