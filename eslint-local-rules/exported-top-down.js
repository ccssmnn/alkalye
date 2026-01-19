/**
 * @fileoverview ESLint rule enforcing top-down readability with explicit export lists.
 * Rule name: local/exported-top-down
 */

/** @type {import('eslint').Rule.RuleModule} */
export let exportedTopDown = {
	meta: {
		type: "suggestion",
		docs: {
			description: "Enforce top-down readability with explicit export lists",
		},
		messages: {
			multipleInlineExports:
				"Modules with multiple exports must use explicit export lists.",
			exportListsAfterImports:
				"Export lists must appear immediately after imports.",
			exportedBeforeNonExported:
				"Exported declarations must appear before non-exported declarations.",
			exportedReferencesAbove:
				"Exported function '{{exported}}' references non-exported function '{{referenced}}' declared above it.",
		},
		schema: [],
	},

	create(context) {
		return {
			Program(node) {
				let body = node.body

				// Collect all info in one pass
				let inlineExports = [] // export function, export const, etc.
				let exportLists = [] // export { ... }, export type { ... }
				let firstNonImportNonExportIndex = -1
				let exportedNames = new Set()
				let functionDecls = new Map() // name -> { node, index, isExported }

				for (let i = 0; i < body.length; i++) {
					let stmt = body[i]

					// Track imports
					if (stmt.type === "ImportDeclaration") {
						continue
					}

					// Track export lists: export { ... } and export type { ... }
					if (stmt.type === "ExportNamedDeclaration" && !stmt.declaration) {
						exportLists.push({ node: stmt, index: i })
						for (let spec of stmt.specifiers) {
							exportedNames.add(spec.local.name)
						}
						continue
					}

					// Track inline exports
					if (stmt.type === "ExportNamedDeclaration" && stmt.declaration) {
						inlineExports.push({ node: stmt, index: i })
						let decl = stmt.declaration
						if (decl.type === "FunctionDeclaration" && decl.id) {
							exportedNames.add(decl.id.name)
							functionDecls.set(decl.id.name, {
								node: decl,
								index: i,
								isExported: true,
							})
						} else if (decl.type === "VariableDeclaration") {
							for (let vdecl of decl.declarations) {
								if (vdecl.id.type === "Identifier") {
									exportedNames.add(vdecl.id.name)
									if (isArrowOrFunctionExpression(vdecl.init)) {
										functionDecls.set(vdecl.id.name, {
											node: vdecl,
											index: i,
											isExported: true,
										})
									}
								}
							}
						}
						continue
					}

					// Track default exports (count as export for multi-export check)
					if (stmt.type === "ExportDefaultDeclaration") {
						inlineExports.push({ node: stmt, index: i })
						continue
					}

					// Track first non-import, non-export statement
					if (firstNonImportNonExportIndex === -1) {
						firstNonImportNonExportIndex = i
					}

					// Track function declarations
					if (stmt.type === "FunctionDeclaration" && stmt.id) {
						functionDecls.set(stmt.id.name, {
							node: stmt,
							index: i,
							isExported: exportedNames.has(stmt.id.name),
						})
					} else if (stmt.type === "VariableDeclaration") {
						for (let vdecl of stmt.declarations) {
							if (
								vdecl.id.type === "Identifier" &&
								isArrowOrFunctionExpression(vdecl.init)
							) {
								functionDecls.set(vdecl.id.name, {
									node: vdecl,
									index: i,
									isExported: exportedNames.has(vdecl.id.name),
								})
							}
						}
					}
				}

				// Second pass: update isExported for functions based on export lists
				for (let [fname, info] of functionDecls) {
					if (exportedNames.has(fname)) {
						info.isExported = true
					}
				}

				// Count unique exports
				let uniqueExportCount = exportedNames.size
				for (let ie of inlineExports) {
					if (ie.node.type === "ExportDefaultDeclaration") {
						uniqueExportCount++
					}
				}

				// Rule 1: Multi-export modules must use explicit export lists
				if (uniqueExportCount > 1 && inlineExports.length > 0) {
					for (let ie of inlineExports) {
						context.report({
							node: ie.node,
							messageId: "multipleInlineExports",
						})
					}
				}

				// Rule 2: Export lists must appear immediately after imports
				for (let el of exportLists) {
					// Export list is valid if it comes before firstNonImportNonExportIndex
					// or if there's no non-import/non-export statement yet
					if (
						firstNonImportNonExportIndex !== -1 &&
						el.index > firstNonImportNonExportIndex
					) {
						context.report({
							node: el.node,
							messageId: "exportListsAfterImports",
						})
					}
				}

				// Rule 3: Exported declarations must appear before non-exported declarations
				let firstNonExportedFuncIndex = -1
				for (let [, info] of functionDecls) {
					if (!info.isExported) {
						if (
							firstNonExportedFuncIndex === -1 ||
							info.index < firstNonExportedFuncIndex
						) {
							firstNonExportedFuncIndex = info.index
						}
					}
				}

				if (firstNonExportedFuncIndex !== -1) {
					for (let [, info] of functionDecls) {
						if (info.isExported && info.index > firstNonExportedFuncIndex) {
							context.report({
								node: info.node,
								messageId: "exportedBeforeNonExported",
							})
						}
					}
				}

				// Rule 4: Directional dependency - exported functions cannot reference
				// non-exported functions declared above them
				for (let [exportedName, exportedInfo] of functionDecls) {
					if (!exportedInfo.isExported) continue

					let funcNode = getFunctionBody(exportedInfo.node)
					if (!funcNode) continue

					let references = collectReferences(funcNode)

					for (let refName of references) {
						let refInfo = functionDecls.get(refName)
						if (!refInfo) continue // not a top-level function
						if (refInfo.isExported) continue // exported functions can reference each other
						if (refInfo.index >= exportedInfo.index) continue // below is fine

						// Non-exported function declared above - error
						context.report({
							node: exportedInfo.node,
							messageId: "exportedReferencesAbove",
							data: {
								exported: exportedName,
								referenced: refName,
							},
						})
					}
				}
			},
		}
	},
}

function isArrowOrFunctionExpression(node) {
	if (!node) return false
	return (
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionExpression"
	)
}

function getFunctionBody(node) {
	// For FunctionDeclaration
	if (node.type === "FunctionDeclaration") {
		return node.body
	}
	// For VariableDeclarator with arrow/function expression
	if (node.type === "VariableDeclarator" && node.init) {
		if (
			node.init.type === "ArrowFunctionExpression" ||
			node.init.type === "FunctionExpression"
		) {
			return node.init.body
		}
	}
	return null
}

function collectReferences(node) {
	let refs = new Set()

	function visit(n) {
		if (!n || typeof n !== "object") return

		if (n.type === "Identifier") {
			// Check if this is a reference (not a declaration or property)
			let parent = n.parent
			if (!parent) {
				refs.add(n.name)
				return
			}

			// Skip property access (foo.bar - skip bar)
			if (
				parent.type === "MemberExpression" &&
				parent.property === n &&
				!parent.computed
			) {
				return
			}

			// Skip declarations
			if (parent.type === "VariableDeclarator" && parent.id === n) {
				return
			}
			if (parent.type === "FunctionDeclaration" && parent.id === n) {
				return
			}
			if (parent.type === "FunctionExpression" && parent.id === n) {
				return
			}

			// Skip function parameters
			if (
				(parent.type === "FunctionDeclaration" ||
					parent.type === "FunctionExpression" ||
					parent.type === "ArrowFunctionExpression") &&
				parent.params &&
				parent.params.includes(n)
			) {
				return
			}

			// Skip object property keys
			if (parent.type === "Property" && parent.key === n && !parent.computed) {
				return
			}

			refs.add(n.name)
			return
		}

		// Recursively visit children, setting parent
		for (let key of Object.keys(n)) {
			if (key === "parent" || key === "range" || key === "loc") continue
			let child = n[key]
			if (Array.isArray(child)) {
				for (let c of child) {
					if (c && typeof c === "object" && c.type) {
						c.parent = n
						visit(c)
					}
				}
			} else if (child && typeof child === "object" && child.type) {
				child.parent = n
				visit(child)
			}
		}
	}

	visit(node)
	return refs
}
