import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

export { Switch }

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				"peer inline-flex h-6 w-11 shrink-0 cursor-pointer touch-manipulation items-center rounded-full border border-transparent transition-colors pointer-fine:h-5 pointer-fine:w-9",
				"focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"data-[checked]:bg-primary data-[unchecked]:bg-input",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					"bg-background pointer-events-none block size-4 rounded-full shadow-sm ring-0 transition-transform pointer-fine:size-4",
					"data-[checked]:translate-x-[1.25rem] data-[unchecked]:translate-x-0.5 pointer-fine:data-[checked]:translate-x-4",
				)}
			/>
		</SwitchPrimitive.Root>
	)
}
