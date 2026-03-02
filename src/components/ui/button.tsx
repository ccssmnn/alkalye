import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

export { Button, buttonVariants }

let buttonVariants = cva(
	"active:scale-97 touch-manipulation focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-none border border-transparent bg-clip-padding text-sm pointer-fine:text-xs font-medium focus-visible:ring-1 aria-invalid:ring-1 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground pointer-fine:[a]:hover:bg-primary/80",
				outline:
					"border-border bg-background pointer-fine:hover:bg-muted pointer-fine:hover:text-foreground dark:bg-background dark:border-input dark:pointer-fine:hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground",
				secondary:
					"bg-secondary text-secondary-foreground pointer-fine:hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost:
					"pointer-fine:hover:bg-muted pointer-fine:hover:text-foreground dark:pointer-fine:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground",
				destructive:
					"bg-destructive/10 pointer-fine:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/20 text-destructive focus-visible:border-destructive/40 dark:pointer-fine:hover:bg-destructive/30",
				brand:
					"bg-brand text-white pointer-fine:hover:bg-brand/90 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40",
				link: "text-primary underline-offset-4 pointer-fine:hover:underline",
			},
			size: {
				default:
					"h-10 pointer-fine:h-8 gap-1.5 px-3 pointer-fine:px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				xs: "h-9 pointer-fine:h-6 gap-1 rounded-none px-3 pointer-fine:px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-10 pointer-fine:h-7 gap-1 rounded-none px-3 pointer-fine:px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-11 pointer-fine:h-9 gap-1.5 px-3 pointer-fine:px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				icon: "size-11 pointer-fine:size-8",
				"icon-xs":
					"size-10 pointer-fine:size-6 rounded-none [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-11 pointer-fine:size-7 rounded-none",
				"icon-lg": "size-12 pointer-fine:size-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
)

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	)
}
