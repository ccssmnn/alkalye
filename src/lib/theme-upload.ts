import JSZip from "jszip"
import { z } from "zod"
import { ThemeType, ThemePreset } from "@/schema"

export {
	parseThemeZip,
	validateThemeJson,
	ThemeJsonSchema,
	type ParsedTheme,
	type ParsedThemeAsset,
	type ThemeUploadError,
}

// Schema for theme.json manifest file
let ThemeJsonSchema = z.object({
	version: z.literal(1),
	name: z.string().min(1, "Theme name is required"),
	author: z.string().optional(),
	description: z.string().optional(),
	type: ThemeType,
	css: z.string().min(1, "CSS file path is required"),
	template: z.string().optional(),
	presets: z.string().optional(),
	fonts: z
		.array(
			z.object({
				name: z.string(),
				path: z.string(),
			}),
		)
		.optional(),
	thumbnail: z.string().optional(),
})

type ThemeJson = z.infer<typeof ThemeJsonSchema>

interface ParsedTheme {
	name: string
	author?: string
	description?: string
	type: z.infer<typeof ThemeType>
	css: string
	template?: string
	presets?: z.infer<typeof ThemePreset>[]
	assets: ParsedThemeAsset[]
	thumbnail?: File
}

interface ParsedThemeAsset {
	name: string
	mimeType: string
	file: File
}

type ThemeUploadError =
	| { type: "invalid_zip"; message: string }
	| { type: "missing_manifest"; message: string }
	| { type: "invalid_manifest"; message: string; errors: string[] }
	| { type: "missing_css"; message: string }
	| { type: "invalid_presets"; message: string; errors: string[] }
	| { type: "missing_file"; message: string; path: string }

type ParseResult =
	| { ok: true; theme: ParsedTheme }
	| { ok: false; error: ThemeUploadError }

async function parseThemeZip(file: File): Promise<ParseResult> {
	let zip: JSZip
	try {
		zip = await JSZip.loadAsync(file)
	} catch {
		return {
			ok: false,
			error: {
				type: "invalid_zip",
				message: "Failed to read zip file. Make sure it's a valid zip archive.",
			},
		}
	}

	// Find theme.json - could be at root or in a single top-level folder
	let themeJsonPath = findFile(zip, "theme.json")
	if (!themeJsonPath) {
		return {
			ok: false,
			error: {
				type: "missing_manifest",
				message:
					"theme.json not found. A valid theme must include a theme.json manifest.",
			},
		}
	}

	// Determine base path (folder containing theme.json)
	let basePath = themeJsonPath.includes("/")
		? themeJsonPath.substring(0, themeJsonPath.lastIndexOf("/") + 1)
		: ""

	// Parse theme.json
	let themeJsonContent: string
	try {
		themeJsonContent = await zip.file(themeJsonPath)!.async("string")
	} catch {
		return {
			ok: false,
			error: {
				type: "invalid_manifest",
				message: "Failed to read theme.json",
				errors: ["Could not read file contents"],
			},
		}
	}

	let themeJsonResult = validateThemeJson(themeJsonContent)
	if (!themeJsonResult.ok) {
		return {
			ok: false,
			error: themeJsonResult.error,
		}
	}

	let themeJson = themeJsonResult.data

	// Read CSS file
	let cssPath = basePath + themeJson.css
	let cssFile = zip.file(cssPath)
	if (!cssFile) {
		return {
			ok: false,
			error: {
				type: "missing_css",
				message: `CSS file not found: ${themeJson.css}`,
			},
		}
	}

	let css: string
	try {
		css = await cssFile.async("string")
	} catch {
		return {
			ok: false,
			error: {
				type: "missing_file",
				message: `Failed to read CSS file: ${themeJson.css}`,
				path: themeJson.css,
			},
		}
	}

	// Read template if specified
	let template: string | undefined
	if (themeJson.template) {
		let templatePath = basePath + themeJson.template
		let templateFile = zip.file(templatePath)
		if (templateFile) {
			try {
				template = await templateFile.async("string")
			} catch {
				// Template is optional, continue without it
			}
		}
	}

	// Read presets if specified
	let presets: z.infer<typeof ThemePreset>[] | undefined
	if (themeJson.presets) {
		let presetsPath = basePath + themeJson.presets
		let presetsFile = zip.file(presetsPath)
		if (presetsFile) {
			try {
				let presetsContent = await presetsFile.async("string")
				let presetsJson = JSON.parse(presetsContent)

				// Validate presets array
				let presetsArray = Array.isArray(presetsJson)
					? presetsJson
					: presetsJson.presets

				if (!Array.isArray(presetsArray)) {
					return {
						ok: false,
						error: {
							type: "invalid_presets",
							message: "presets.json must contain an array of presets",
							errors: ["Expected an array of presets"],
						},
					}
				}

				let validatedPresets: z.infer<typeof ThemePreset>[] = []
				let presetErrors: string[] = []

				for (let i = 0; i < presetsArray.length; i++) {
					let result = ThemePreset.safeParse(presetsArray[i])
					if (result.success) {
						validatedPresets.push(result.data)
					} else {
						for (let issue of result.error.issues) {
							presetErrors.push(
								`Preset ${i + 1}: ${issue.path.join(".")} - ${issue.message}`,
							)
						}
					}
				}

				if (presetErrors.length > 0) {
					return {
						ok: false,
						error: {
							type: "invalid_presets",
							message: "Invalid preset definitions in presets.json",
							errors: presetErrors,
						},
					}
				}

				presets = validatedPresets
			} catch (e) {
				return {
					ok: false,
					error: {
						type: "invalid_presets",
						message: "Failed to parse presets.json",
						errors: [e instanceof Error ? e.message : "Invalid JSON"],
					},
				}
			}
		}
	}

	// Extract font assets
	let assets: ParsedThemeAsset[] = []
	if (themeJson.fonts) {
		for (let font of themeJson.fonts) {
			let fontPath = basePath + font.path
			let fontFile = zip.file(fontPath)
			if (fontFile) {
				try {
					let blob = await fontFile.async("blob")
					let mimeType = getFontMimeType(font.path)
					let file = new File([blob], font.name, { type: mimeType })
					assets.push({
						name: font.name,
						mimeType,
						file,
					})
				} catch {
					// Font loading failed, continue without it
				}
			}
		}
	}

	// Read thumbnail if specified
	let thumbnail: File | undefined
	if (themeJson.thumbnail) {
		let thumbnailPath = basePath + themeJson.thumbnail
		let thumbnailFile = zip.file(thumbnailPath)
		if (thumbnailFile) {
			try {
				let blob = await thumbnailFile.async("blob")
				let mimeType = getImageMimeType(themeJson.thumbnail)
				thumbnail = new File([blob], "thumbnail", { type: mimeType })
			} catch {
				// Thumbnail is optional, continue without it
			}
		}
	}

	return {
		ok: true,
		theme: {
			name: themeJson.name,
			author: themeJson.author,
			description: themeJson.description,
			type: themeJson.type,
			css,
			template,
			presets,
			assets,
			thumbnail,
		},
	}
}

function validateThemeJson(
	content: string,
): { ok: true; data: ThemeJson } | { ok: false; error: ThemeUploadError } {
	let json: unknown
	try {
		json = JSON.parse(content)
	} catch {
		return {
			ok: false,
			error: {
				type: "invalid_manifest",
				message: "theme.json is not valid JSON",
				errors: ["Failed to parse JSON"],
			},
		}
	}

	let result = ThemeJsonSchema.safeParse(json)
	if (!result.success) {
		let errors = result.error.issues.map(
			issue => `${issue.path.join(".")}: ${issue.message}`,
		)
		return {
			ok: false,
			error: {
				type: "invalid_manifest",
				message: "theme.json validation failed",
				errors,
			},
		}
	}

	return { ok: true, data: result.data }
}

function findFile(zip: JSZip, filename: string): string | null {
	// Check root level first
	if (zip.file(filename)) {
		return filename
	}

	// Check one level deep (common for zips with a top-level folder)
	let found: string | null = null
	zip.forEach((path, entry) => {
		if (entry.dir) return
		if (path.endsWith("/" + filename) && path.split("/").length === 2) {
			found = path
		}
	})

	return found
}

function getFontMimeType(path: string): string {
	let ext = path.toLowerCase().split(".").pop()
	let mimeTypes: Record<string, string> = {
		woff2: "font/woff2",
		woff: "font/woff",
		ttf: "font/ttf",
		otf: "font/otf",
	}
	return mimeTypes[ext || ""] || "font/woff2"
}

function getImageMimeType(path: string): string {
	let ext = path.toLowerCase().split(".").pop()
	let mimeTypes: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
	}
	return mimeTypes[ext || ""] || "image/png"
}
