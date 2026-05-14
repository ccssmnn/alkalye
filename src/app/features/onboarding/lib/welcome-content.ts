export { fetchWelcomeContent, getSpaceWelcomeContent }

let FALLBACK_WELCOME_CONTENT = `# Welcome to Alkalye

A beautiful markdown editor. Private by design.

Your words are end-to-end encrypted. Collaborate in real-time. Works on any device.

**Get started:** Edit this document, create a new one, or open a tutor from the Help menu.
`

function getSpaceWelcomeContent(spaceName: string): string {
	return `# Welcome to ${spaceName}

This is your new shared space. Documents here are shared with all space members.

**Get started:** Edit this document or create a new one.
`
}

async function fetchWelcomeContent(): Promise<string> {
	try {
		let response = await fetch("/docs/welcome.md")
		if (!response.ok) return FALLBACK_WELCOME_CONTENT
		return await response.text()
	} catch {
		return FALLBACK_WELCOME_CONTENT
	}
}
