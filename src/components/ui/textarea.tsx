import * as React from "react"
import TextareaAutosize from "react-textarea-autosize"

import { cn } from "@/lib/utils"

export { Textarea }

function Textarea({
	className,
	minRows = 3,
	...props
}: React.ComponentProps<typeof TextareaAutosize>) {
	return (
		<TextareaAutosize
			minRows={minRows}
			data-slot="textarea"
			className={cn(
				"border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 placeholder:text-muted-foreground flex w-full min-w-0 rounded-none border bg-transparent px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-1 md:text-xs",
				className,
			)}
			{...props}
		/>
	)
}
