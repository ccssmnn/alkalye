import { cn } from "@/lib/utils"

export { Progress }

interface ProgressProps extends React.ComponentProps<"div"> {
	value?: number
	max?: number
}

function Progress({
	className,
	value = 0,
	max = 100,
	...props
}: ProgressProps) {
	let percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

	return (
		<div
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={max}
			aria-valuenow={value}
			className={cn(
				"bg-muted relative h-2 w-full overflow-hidden rounded-full",
				className,
			)}
			{...props}
		>
			<div
				className="bg-primary h-full transition-all duration-300 ease-out"
				style={{ width: `${percentage}%` }}
			/>
		</div>
	)
}
