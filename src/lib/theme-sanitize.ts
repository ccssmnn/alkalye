import DOMPurify, { type Config } from "dompurify"

export { sanitizeCss, sanitizeHtml, type SanitizeResult }

type SanitizeResult = {
	sanitized: string
	removedCount: number
	removedPatterns: string[]
}

// Dangerous CSS patterns that could be used for XSS or data exfiltration
let dangerousPatterns: { pattern: RegExp; name: string }[] = [
	// JavaScript execution
	{ pattern: /javascript\s*:/gi, name: "javascript:" },
	{ pattern: /expression\s*\(/gi, name: "expression()" },
	{ pattern: /-moz-binding\s*:/gi, name: "-moz-binding" },

	// IE-specific exploits
	{ pattern: /behavior\s*:/gi, name: "behavior:" },
	{ pattern: /vbscript\s*:/gi, name: "vbscript:" },

	// External resource loading (data exfiltration risk)
	{
		pattern: /@import\s+(?:url\s*\()?['"]?https?:\/\//gi,
		name: "@import external URL",
	},
	{
		pattern: /@import\s+(?:url\s*\()?['"]?\/\//gi,
		name: "@import protocol-relative URL",
	},

	// Data URL with scripts
	{
		pattern: /url\s*\(\s*['"]?\s*data\s*:\s*text\/html/gi,
		name: "data:text/html URL",
	},
]

// Sanitize CSS content by removing dangerous patterns
function sanitizeCss(css: string): SanitizeResult {
	let sanitized = css
	let removedPatterns: string[] = []

	for (let { pattern, name } of dangerousPatterns) {
		if (pattern.test(sanitized)) {
			removedPatterns.push(name)
			sanitized = sanitized.replace(pattern, "/* removed: " + name + " */")
		}
		// Reset lastIndex for global regex
		pattern.lastIndex = 0
	}

	return {
		sanitized,
		removedCount: removedPatterns.length,
		removedPatterns,
	}
}

// Configure DOMPurify for HTML template sanitization
// Allows data-* attributes for template functionality
// Removes scripts, event handlers, and dangerous elements
let purifyConfig: Config = {
	// Allow common HTML elements
	ALLOWED_TAGS: [
		// Document structure
		"html",
		"head",
		"body",
		"main",
		"header",
		"footer",
		"nav",
		"aside",
		"section",
		"article",

		// Block elements
		"div",
		"p",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"blockquote",
		"pre",
		"code",
		"hr",

		// Lists
		"ul",
		"ol",
		"li",
		"dl",
		"dt",
		"dd",

		// Tables
		"table",
		"thead",
		"tbody",
		"tfoot",
		"tr",
		"th",
		"td",
		"caption",
		"colgroup",
		"col",

		// Inline elements
		"span",
		"a",
		"strong",
		"b",
		"em",
		"i",
		"u",
		"s",
		"mark",
		"small",
		"sub",
		"sup",
		"br",

		// Media (without script capability)
		"img",
		"figure",
		"figcaption",
		"picture",
		"source",

		// Form elements (display only, no submission)
		"label",
		"input",

		// Other semantic elements
		"time",
		"abbr",
		"cite",
		"dfn",
		"kbd",
		"samp",
		"var",
		"address",
		"details",
		"summary",

		// Style (CSS is separately sanitized)
		"style",
		"link",
		"meta",
		"title",
	],

	// Allow common attributes including data-* for templates
	ALLOWED_ATTR: [
		// Global attributes
		"id",
		"class",
		"style",
		"title",
		"lang",
		"dir",
		"hidden",
		"tabindex",

		// Links
		"href",
		"target",
		"rel",

		// Images
		"src",
		"alt",
		"width",
		"height",
		"loading",

		// Tables
		"colspan",
		"rowspan",
		"scope",

		// Accessibility
		"aria-label",
		"aria-labelledby",
		"aria-describedby",
		"aria-hidden",
		"role",

		// Meta/Link
		"charset",
		"name",
		"content",
		"type",
		"media",

		// Input (display only)
		"placeholder",
		"value",
		"disabled",
		"readonly",
		"checked",
	],

	// Allow data-* attributes (needed for data-document placeholder)
	ADD_ATTR: ["data-document", "data-theme", "data-*"],

	// Forbid dangerous tags
	FORBID_TAGS: [
		"script",
		"iframe",
		"object",
		"embed",
		"form",
		"button",
		"frame",
		"frameset",
		"portal",
		"applet",
		"base",
		"noscript",
	],

	// Forbid event handlers and dangerous attributes
	FORBID_ATTR: [
		// Event handlers
		"onclick",
		"ondblclick",
		"onmousedown",
		"onmouseup",
		"onmouseover",
		"onmouseout",
		"onmousemove",
		"onmouseenter",
		"onmouseleave",
		"onkeydown",
		"onkeyup",
		"onkeypress",
		"onfocus",
		"onblur",
		"onchange",
		"oninput",
		"onsubmit",
		"onreset",
		"onload",
		"onerror",
		"onabort",
		"onresize",
		"onscroll",
		"onunload",
		"onbeforeunload",
		"onhashchange",
		"onpopstate",
		"onstorage",
		"onmessage",
		"onoffline",
		"ononline",
		"onpageshow",
		"onpagehide",
		"oncontextmenu",
		"oncopy",
		"oncut",
		"onpaste",
		"ondrag",
		"ondragend",
		"ondragenter",
		"ondragleave",
		"ondragover",
		"ondragstart",
		"ondrop",
		"onanimationstart",
		"onanimationend",
		"onanimationiteration",
		"ontransitionend",
		"onwheel",
		"ontouchstart",
		"ontouchend",
		"ontouchmove",
		"ontouchcancel",
		"onpointerdown",
		"onpointerup",
		"onpointermove",
		"onpointerenter",
		"onpointerleave",
		"onpointercancel",
		"onformdata",
		"onslotchange",
		"onplay",
		"onplaying",
		"onpause",
		"onended",
		"onseeked",
		"onseeking",
		"ontimeupdate",
		"onvolumechange",
		"onloadstart",
		"onprogress",
		"oncanplay",
		"oncanplaythrough",
		"ondurationchange",
		"onemptied",
		"onstalled",
		"onsuspend",
		"onwaiting",
		"onratechange",
		"onloadedmetadata",
		"onloadeddata",
		// Other dangerous attributes
		"formaction",
		"xlink:href",
		"xmlns:xlink",
		"srcdoc",
	],

	// Don't allow javascript: URLs
	ALLOW_UNKNOWN_PROTOCOLS: false,

	// Use secure defaults
	USE_PROFILES: { html: true },

	// Return a document fragment for full HTML documents
	RETURN_DOM: false,
	RETURN_DOM_FRAGMENT: false,

	// Keep the structure
	WHOLE_DOCUMENT: false,
}

// Sanitize HTML template content
function sanitizeHtml(html: string): SanitizeResult {
	let removedPatterns: string[] = []
	let removedCount = 0

	// Set up hooks to track what was removed
	DOMPurify.addHook("uponSanitizeElement", (_node, data) => {
		if (data.tagName && purifyConfig.FORBID_TAGS?.includes(data.tagName)) {
			removedPatterns.push(`<${data.tagName}>`)
			removedCount++
		}
	})

	DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
		if (data.attrName) {
			// Check for javascript: in href/src
			if (
				(data.attrName === "href" || data.attrName === "src") &&
				data.attrValue?.toLowerCase().trim().startsWith("javascript:")
			) {
				removedPatterns.push(`${data.attrName}="javascript:..."`)
				removedCount++
			}
			// Check for event handlers
			if (data.attrName.startsWith("on")) {
				removedPatterns.push(`${data.attrName}`)
				removedCount++
			}
		}
	})

	let sanitized: string = DOMPurify.sanitize(html, purifyConfig)

	// Remove hooks after sanitization
	DOMPurify.removeHooks("uponSanitizeElement")
	DOMPurify.removeHooks("uponSanitizeAttribute")

	// Deduplicate patterns
	let uniquePatterns = [...new Set(removedPatterns)]

	return {
		sanitized,
		removedCount,
		removedPatterns: uniquePatterns,
	}
}
