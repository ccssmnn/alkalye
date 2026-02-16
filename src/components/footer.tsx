import { Github, Bird } from "lucide-react"
import { Link } from "@tanstack/react-router"

export { Footer }

function Footer() {
	return (
		<footer className="text-muted-foreground mx-auto max-w-2xl px-3 py-6 text-center text-xs">
			<div className="flex items-center justify-center gap-4">
				<a
					href="https://twitter.com/ccssmnn"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-foreground p-1 transition-colors"
				>
					<Bird className="size-4" />
					<span className="sr-only">@ccssmnn</span>
				</a>
				<a
					href="https://github.com/ccssmnn/alkalye"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-foreground p-1 transition-colors"
				>
					<Github className="size-4" />
					<span className="sr-only">GitHub</span>
				</a>
				<Link
					to="/privacy"
					className="hover:text-foreground p-1 transition-colors"
				>
					Privacy
				</Link>
				<Link
					to="/imprint"
					className="hover:text-foreground p-1 transition-colors"
				>
					Imprint
				</Link>
			</div>
		</footer>
	)
}
