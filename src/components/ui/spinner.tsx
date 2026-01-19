import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

export { Spinner }

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
	return (
		<Loader2Icon
			role="status"
			aria-label="Loading"
			className={cn("size-4 animate-spin", className)}
			{...props}
		/>
	)
}
