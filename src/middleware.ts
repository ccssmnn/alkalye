import { defineMiddleware } from "astro:middleware"

export let onRequest = defineMiddleware((context, next) => {
	if (context.url.pathname === "/") {
		let acceptLanguage = context.request.headers.get("accept-language")
		let preferredLang = acceptLanguage
			?.split(",")[0]
			.split("-")[0]
			.toLowerCase()
		let locale = preferredLang === "de" ? "de" : "en"
		return context.redirect(`/${locale}/`, 302)
	}

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
