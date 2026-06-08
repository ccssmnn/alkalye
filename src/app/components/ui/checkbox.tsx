import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/app/lib/cn"

export { Checkbox }

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				"border-input bg-background text-primary-foreground focus-visible:border-ring focus-visible:ring-ring/50 peer data-[checked]:border-primary data-[checked]:bg-primary size-4 shrink-0 rounded-none border shadow-xs transition-shadow outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="flex items-center justify-center text-current"
			>
				<CheckIcon className="size-3" />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	)
}
