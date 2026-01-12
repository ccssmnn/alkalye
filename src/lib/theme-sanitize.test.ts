import { describe, it, expect } from "vitest"
import { sanitizeCss, sanitizeHtml } from "./theme-sanitize"

// =============================================================================
// CSS Sanitization Tests
// =============================================================================

describe("sanitizeCss", () => {
	it("passes through safe CSS unchanged", () => {
		let css = `
body {
	font-family: Arial, sans-serif;
	color: #333;
	background: linear-gradient(to right, #fff, #f0f0f0);
}

h1 {
	font-size: 2rem;
	margin-bottom: 1em;
}

@media (max-width: 768px) {
	body { padding: 1rem; }
}
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(0)
		expect(result.sanitized).toBe(css)
	})

	it("removes javascript: URLs", () => {
		let css = `
a {
	background: url(javascript:alert('xss'));
}
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(1)
		expect(result.removedPatterns).toContain("javascript:")
		// Pattern is replaced with a comment - the original dangerous pattern is neutralized
		expect(result.sanitized).toContain("/* removed:")
		expect(result.sanitized).not.toMatch(/url\s*\(\s*javascript\s*:/i)
	})

	it("removes expression() (IE CSS exploit)", () => {
		let css = `
div {
	width: expression(alert('xss'));
}
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(1)
		expect(result.removedPatterns).toContain("expression()")
		// Pattern is replaced with comment - original dangerous call is neutralized
		expect(result.sanitized).toContain("/* removed:")
		// Dangerous pattern should not appear outside of comments
		expect(result.sanitized).not.toMatch(/width:\s*expression\s*\(/i)
	})

	it("removes -moz-binding (Firefox exploit)", () => {
		let css = `
div {
	-moz-binding: url("http://evil.com/xss.xml#xss");
}
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(1)
		expect(result.removedPatterns).toContain("-moz-binding")
		// Pattern is replaced with comment - original dangerous property is neutralized
		expect(result.sanitized).toContain("/* removed:")
		expect(result.sanitized).not.toMatch(/-moz-binding\s*:/i)
	})

	it("removes behavior: (IE exploit)", () => {
		let css = `
div {
	behavior: url(script.htc);
}
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(1)
		expect(result.removedPatterns).toContain("behavior:")
		// Pattern is replaced with comment - original dangerous property is neutralized
		expect(result.sanitized).toContain("/* removed:")
		// Verify behavior: property is no longer active (replaced with comment)
		expect(result.sanitized).not.toMatch(/^\s*behavior\s*:/im)
	})

	it("removes vbscript: URLs", () => {
		let css = `
a {
	background: url(vbscript:msgbox('xss'));
}
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(1)
		expect(result.removedPatterns).toContain("vbscript:")
		// Pattern is replaced with comment - original dangerous URL is neutralized
		expect(result.sanitized).toContain("/* removed:")
		expect(result.sanitized).not.toMatch(/url\s*\(\s*vbscript\s*:/i)
	})

	it("removes @import with untrusted external URLs", () => {
		let css = `
@import url("https://evil.com/malicious.css");
@import 'http://evil.com/bad.css';
`
		let result = sanitizeCss(css)
		expect(result.removedPatterns).toContain("@import untrusted external URL")
		expect(result.sanitized).not.toContain("https://evil.com")
		expect(result.sanitized).not.toContain("http://evil.com")
	})

	it("allows @import from Google Fonts", () => {
		let css = `
@import url("https://fonts.googleapis.com/css2?family=Roboto&display=swap");
@import url('https://fonts.gstatic.com/s/roboto/v30/roboto.woff2');
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(0)
		expect(result.sanitized).toContain("fonts.googleapis.com")
		expect(result.sanitized).toContain("fonts.gstatic.com")
	})

	it("allows @import from other trusted font CDNs", () => {
		let css = `
@import url("https://use.typekit.net/abc123.css");
@import url("https://fonts.bunny.net/css?family=Inter");
@import url("https://rsms.me/inter/inter.css");
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(0)
		expect(result.sanitized).toContain("use.typekit.net")
		expect(result.sanitized).toContain("fonts.bunny.net")
		expect(result.sanitized).toContain("rsms.me")
	})

	it("removes @import with protocol-relative URLs", () => {
		let css = `
@import url("//evil.com/malicious.css");
`
		let result = sanitizeCss(css)
		expect(result.removedPatterns).toContain("@import protocol-relative URL")
		expect(result.sanitized).not.toContain("//evil.com")
	})

	it("allows @import with relative URLs", () => {
		let css = `
@import url("./fonts.css");
@import "typography.css";
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(0)
		expect(result.sanitized).toContain("./fonts.css")
		expect(result.sanitized).toContain("typography.css")
	})

	it("removes data:text/html URLs (XSS vector)", () => {
		let css = `
div {
	background: url(data:text/html,<script>alert('xss')</script>);
}
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(1)
		expect(result.removedPatterns).toContain("data:text/html URL")
		// Pattern is replaced with comment - original dangerous URL is neutralized
		expect(result.sanitized).toContain("/* removed:")
		expect(result.sanitized).not.toMatch(
			/url\s*\(\s*['"]?\s*data\s*:\s*text\/html/i,
		)
	})

	it("allows safe data: URLs (images)", () => {
		let css = `
div {
	background: url(data:image/png;base64,iVBORw0KGgo=);
}
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(0)
		expect(result.sanitized).toContain("data:image/png")
	})

	it("handles case insensitivity in dangerous patterns", () => {
		let css = `
a { background: url(JAVASCRIPT:alert('xss')); }
b { width: EXPRESSION(alert(1)); }
c { BEHAVIOR: url(bad.htc); }
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(3)
	})

	it("handles multiple dangerous patterns in same CSS", () => {
		let css = `
@import url("https://evil.com/bad.css");
div {
	behavior: url(evil.htc);
	background: url(javascript:alert(1));
}
`
		let result = sanitizeCss(css)
		expect(result.removedCount).toBe(3)
		expect(result.removedPatterns).toContain("@import untrusted external URL")
		expect(result.removedPatterns).toContain("behavior:")
		expect(result.removedPatterns).toContain("javascript:")
	})

	it("preserves CSS structure while removing dangerous content", () => {
		let css = `
body {
	font-family: "Custom Font";
	background: url(javascript:evil());
	color: #333;
}
`
		let result = sanitizeCss(css)
		expect(result.sanitized).toContain("font-family")
		expect(result.sanitized).toContain("color: #333")
		expect(result.sanitized).toContain("/* removed: javascript: */")
	})
})

// =============================================================================
// HTML Sanitization Tests
// =============================================================================

describe("sanitizeHtml", () => {
	it("passes through safe HTML unchanged", () => {
		let html = `
<div class="container">
	<h1>Title</h1>
	<p>Some <strong>bold</strong> text.</p>
	<a href="/page">Link</a>
</div>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).toContain("<div")
		expect(result.sanitized).toContain("<h1>")
		expect(result.sanitized).toContain("<strong>")
		expect(result.sanitized).toContain("<a href=")
	})

	it("removes <script> tags", () => {
		let html = `
<div>Safe content</div>
<script>alert('xss')</script>
<p>More content</p>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("<script>")
		expect(result.sanitized).not.toContain("alert")
		expect(result.sanitized).toContain("Safe content")
	})

	it("removes onclick handlers", () => {
		let html = `<button onclick="evil()">Click</button>`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("onclick")
		expect(result.sanitized).not.toContain("evil()")
	})

	it("removes various event handlers", () => {
		let html = `
<div onmouseover="bad()">Hover</div>
<img onerror="xss()" src="x">
<body onload="attack()">
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("onmouseover")
		expect(result.sanitized).not.toContain("onerror")
		expect(result.sanitized).not.toContain("onload")
	})

	it("removes javascript: URLs in hrefs", () => {
		let html = `<a href="javascript:alert('xss')">Click me</a>`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("javascript:")
	})

	it("removes iframe tags", () => {
		let html = `
<div>Content</div>
<iframe src="http://evil.com"></iframe>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("<iframe")
		expect(result.sanitized).toContain("Content")
	})

	it("removes object tags", () => {
		let html = `<object data="flash.swf"></object>`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("<object")
	})

	it("removes embed tags", () => {
		let html = `<embed src="plugin.swf">`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("<embed")
	})

	it("removes form tags", () => {
		let html = `<form action="/steal"><input type="text"></form>`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("<form")
	})

	it("preserves data-* attributes", () => {
		let html = `<div data-document data-theme="dark" data-custom="value">Content</div>`
		let result = sanitizeHtml(html)
		expect(result.sanitized).toContain("data-document")
		expect(result.sanitized).toContain('data-theme="dark"')
		expect(result.sanitized).toContain('data-custom="value"')
	})

	it("preserves safe attributes", () => {
		let html = `
<div id="main" class="container" style="color: red">
	<a href="/page" target="_blank" rel="noopener">Link</a>
	<img src="image.png" alt="Alt text" width="100" height="100">
</div>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).toContain('id="main"')
		expect(result.sanitized).toContain('class="container"')
		expect(result.sanitized).toContain("style=")
		// DOMPurify allows target attribute
		expect(result.sanitized).toContain('href="/page"')
		expect(result.sanitized).toContain('alt="Alt text"')
	})

	it("preserves accessibility attributes", () => {
		let html = `
<div role="main" aria-label="Main content" aria-hidden="false">
	<span aria-describedby="desc">Action</span>
</div>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).toContain('role="main"')
		expect(result.sanitized).toContain("aria-label=")
		expect(result.sanitized).toContain("aria-hidden=")
		expect(result.sanitized).toContain("aria-describedby=")
	})

	it("handles template structure with data-document", () => {
		let html = `
<article class="document">
	<header><h1>Title</h1></header>
	<main data-document></main>
	<footer>Copyright</footer>
</article>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).toContain("<article")
		expect(result.sanitized).toContain("<header>")
		expect(result.sanitized).toContain("<main")
		expect(result.sanitized).toContain("data-document")
		expect(result.sanitized).toContain("<footer>")
	})

	it("removes nested script tags", () => {
		let html = `
<div>
	<script>
		document.write('<script>alert(1)</script>');
	</script>
</div>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("<script")
		expect(result.sanitized).not.toContain("document.write")
	})

	it("removes svg with embedded scripts", () => {
		let html = `
<svg onload="alert(1)">
	<script>evil()</script>
</svg>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("onload")
		expect(result.sanitized).not.toContain("<script")
	})

	it("removes base tag (can redirect all URLs)", () => {
		let html = `
<head><base href="http://evil.com/"></head>
<body><a href="/page">Safe link?</a></body>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).not.toContain("<base")
	})

	it("preserves table structure", () => {
		let html = `
<table>
	<thead><tr><th>Header</th></tr></thead>
	<tbody><tr><td>Data</td></tr></tbody>
</table>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).toContain("<table>")
		expect(result.sanitized).toContain("<thead>")
		expect(result.sanitized).toContain("<tbody>")
		expect(result.sanitized).toContain("<th>")
		expect(result.sanitized).toContain("<td>")
	})

	it("preserves list structure", () => {
		let html = `
<ul>
	<li>Item 1</li>
	<li>Item 2</li>
</ul>
<ol>
	<li>First</li>
</ol>
`
		let result = sanitizeHtml(html)
		expect(result.sanitized).toContain("<ul>")
		expect(result.sanitized).toContain("<ol>")
		expect(result.sanitized).toContain("<li>")
	})

	it("handles mixed safe and unsafe content", () => {
		let html = `
<div class="content">
	<h1>Welcome</h1>
	<script>steal_cookies()</script>
	<p onclick="bad()">Click this paragraph</p>
	<a href="javascript:void(0)">Bad link</a>
	<iframe src="evil.com"></iframe>
	<img src="safe.png" alt="Safe image">
</div>
`
		let result = sanitizeHtml(html)
		// Safe content preserved
		expect(result.sanitized).toContain("<div")
		expect(result.sanitized).toContain("<h1>Welcome</h1>")
		expect(result.sanitized).toContain("<img")
		expect(result.sanitized).toContain('alt="Safe image"')
		// Dangerous content removed
		expect(result.sanitized).not.toContain("<script")
		expect(result.sanitized).not.toContain("onclick")
		expect(result.sanitized).not.toContain("javascript:")
		expect(result.sanitized).not.toContain("<iframe")
	})
})
