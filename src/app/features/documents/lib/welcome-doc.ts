export { isWelcomeDoc }

function isWelcomeDoc(content: string): boolean {
	return content.startsWith("# Welcome to Alkalye")
}
