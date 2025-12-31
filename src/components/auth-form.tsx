import { useState } from "react"
import { usePassphraseAuth } from "jazz-tools/react"
import { Copy, Check, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { wordlist } from "@/lib/wordlist"
import { getRandomWriterName } from "@/schema"

export { AuthForm }

interface AuthFormProps {
	onSuccess?: () => void
}

function AuthForm({ onSuccess }: AuthFormProps) {
	let auth = usePassphraseAuth({ wordlist })
	let [step, setStep] = useState<"initial" | "create" | "login">("initial")
	let [loginPassphrase, setLoginPassphrase] = useState("")
	let [isCopied, setIsCopied] = useState(false)
	let [currentPassphrase, setCurrentPassphrase] = useState(() =>
		auth.generateRandomPassphrase(),
	)
	let [error, setError] = useState("")

	function handleReroll() {
		setCurrentPassphrase(auth.generateRandomPassphrase())
		setIsCopied(false)
	}

	async function handleCopy() {
		await navigator.clipboard.writeText(currentPassphrase)
		setIsCopied(true)
	}

	async function handleRegister() {
		try {
			await auth.registerNewAccount(currentPassphrase, getRandomWriterName())
			onSuccess?.()
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to register")
		}
	}

	async function handleLogin() {
		try {
			setError("")
			await auth.logIn(loginPassphrase)
			onSuccess?.()
		} catch (e) {
			setError(e instanceof Error ? e.message : "Invalid passphrase")
		}
	}

	return (
		<div className="bg-muted/30 rounded-lg p-4">
			{step === "initial" && (
				<>
					<p className="text-muted-foreground mb-4 text-sm">
						Sign in with your{" "}
						<span className="text-foreground font-bold">recovery phrase</span>{" "}
						to sync your notes across devices and collaborate with others.
					</p>
					<div className="flex flex-col justify-end gap-2">
						<Button onClick={() => setStep("create")} size="sm">
							Create new account
						</Button>
						<Button
							onClick={() => setStep("login")}
							variant="outline"
							size="sm"
						>
							Sign in
						</Button>
					</div>
				</>
			)}

			{step === "create" && (
				<>
					<h3 className="mb-2 font-medium">Your recovery phrase</h3>
					<p className="text-muted-foreground mb-12 text-sm">
						Alkalye uses recovery phrases instead of passwords.{" "}
						<span className="text-foreground font-bold">No email required</span>{" "}
						- just save this phrase to access your notes anywhere.
					</p>
					<textarea
						readOnly
						value={currentPassphrase}
						className="bg-background border-border mb-3 w-full resize-none rounded-md border p-3 font-mono text-sm"
						rows={3}
					/>
					<div className="mb-3 flex gap-2">
						<Button
							onClick={handleCopy}
							variant="outline"
							size="sm"
							className="flex-1"
						>
							{isCopied ? (
								<>
									<Check className="mr-1 size-3.5" />
									Copied
								</>
							) : (
								<>
									<Copy className="mr-1 size-3.5" />
									Copy
								</>
							)}
						</Button>
						<Button onClick={handleReroll} variant="outline" size="sm">
							<RefreshCw className="size-3.5" />
						</Button>
					</div>
					{error && <p className="text-destructive mb-3 text-sm">{error}</p>}
					<div className="mt-12 flex justify-end gap-2">
						<Button
							onClick={() => setStep("initial")}
							variant="ghost"
							size="sm"
							className="flex-1"
						>
							Back
						</Button>
						<Button
							onClick={handleRegister}
							size="sm"
							disabled={!isCopied}
							className="flex-1"
						>
							Create account
						</Button>
					</div>
				</>
			)}

			{step === "login" && (
				<>
					<h3 className="mb-2 font-medium">Enter your recovery phrase</h3>
					<p className="text-muted-foreground mb-4 text-sm">
						Enter the recovery phrase from when you created your account.
					</p>
					<textarea
						value={loginPassphrase}
						onChange={e => setLoginPassphrase(e.target.value)}
						placeholder="word1 word2 word3 ..."
						className="bg-background border-border mb-3 w-full resize-none rounded-md border p-3 font-mono text-sm"
						rows={3}
					/>
					{error && <p className="text-destructive mb-3 text-sm">{error}</p>}
					<div className="flex gap-2">
						<Button
							onClick={() => {
								setStep("initial")
								setError("")
							}}
							variant="ghost"
							size="sm"
							className="flex-1"
						>
							Back
						</Button>
						<Button
							onClick={handleLogin}
							size="sm"
							disabled={!loginPassphrase.trim()}
							className="flex-1"
						>
							Sign in
						</Button>
					</div>
				</>
			)}
		</div>
	)
}
