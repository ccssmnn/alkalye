import { useEffect, useState } from "react"

interface MarkdownViewProps {
	src: string
}

export { MarkdownView }

function MarkdownView({ src }: MarkdownViewProps) {
	let [content, setContent] = useState("")

	useEffect(() => {
		fetch(src)
			.then(res => res.text())
			.then(setContent)
			.catch(() => setContent("Failed to load content"))
	}, [src])

	return (
		<div className="prose prose-sm dark:prose-invert max-w-none">
			{content.split("\n").map((line, i) => {
				if (line.startsWith("# ")) {
					return <h1 key={i}>{line.slice(2)}</h1>
				}
				if (line.startsWith("## ")) {
					return <h2 key={i}>{line.slice(3)}</h2>
				}
				if (line.startsWith("### ")) {
					return <h3 key={i}>{line.slice(4)}</h3>
				}
				if (line.startsWith("- ")) {
					return <li key={i}>{line.slice(2)}</li>
				}
				if (line.startsWith("**") && line.endsWith("**")) {
					return (
						<p key={i}>
							<strong>{line.slice(2, -2)}</strong>
						</p>
					)
				}
				if (line.trim() === "") {
					return <br key={i} />
				}
				return <p key={i}>{line}</p>
			})}
		</div>
	)
}
