import { cojsonInternals } from "cojson"
import { WasmCrypto } from "cojson/crypto/WasmCrypto"
import { WebSocketPeerWithReconnection } from "cojson-transport-ws"
import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39"
import {
	AuthSecretStorage,
	MockSessionProvider,
	createJazzContext,
	createJazzContextForNewAccount,
	createJazzContextFromExistingCredentials,
	type ID,
	type Loaded,
	type Peer,
} from "jazz-tools"
import { wordlist } from "@/lib/wordlist"
import { UserAccount } from "@/schema"
import { AuthError } from "@/cli/errors"
import { ensureCliKvStore } from "@/cli/kv-store"
import type { CliConfig } from "@/cli/config"

export {
	createAuthenticatedJazz,
	signUpWithPassphrase,
	logInWithPassphrase,
	logOut,
	getStoredCredentials,
	getPassphraseFromStorage,
	generatePassphrase,
}

async function createAuthenticatedJazz(config: CliConfig) {
	ensureCliKvStore(config.authFile)
	let authSecretStorage = new AuthSecretStorage()
	let credentials = await authSecretStorage.get()
	if (!credentials?.accountID || !credentials.accountSecret) {
		throw new AuthError({ message: "Not logged in" })
	}

	let crypto = await WasmCrypto.create()
	let peerState = createPeerState(config.syncPeer)
	let context = await createJazzContext({
		peers: peerState.peers,
		crypto,
		authSecretStorage,
		sessionProvider: new MockSessionProvider(),
		AccountSchema: UserAccount,
	})
	peerState.attach(context.node)

	return {
		account: context.account,
		authSecretStorage,
		async done() {
			context.done()
			peerState.shutdown()
		},
	}
}

async function signUpWithPassphrase(args: {
	config: CliConfig
	name: string
	passphrase: string
}) {
	ensureCliKvStore(args.config.authFile)
	let authSecretStorage = new AuthSecretStorage()
	let crypto = await WasmCrypto.create()
	let peerState = createPeerState(args.config.syncPeer)
	let secretSeed = mnemonicToEntropy(args.passphrase, wordlist)
	let initialAgentSecret = crypto.agentSecretFromSecretSeed(secretSeed)

	let context = await createJazzContextForNewAccount({
		creationProps: { name: args.name },
		initialAgentSecret,
		peers: peerState.peers,
		crypto,
		AccountSchema: UserAccount,
		sessionProvider: new MockSessionProvider(),
	})
	peerState.attach(context.node)

	await authSecretStorage.set({
		accountID: context.account.$jazz.id,
		accountSecret: context.node.getCurrentAgent().agentSecret,
		secretSeed,
		provider: "passphrase",
	})

	return {
		account: context.account,
		passphrase: args.passphrase,
		async done() {
			context.done()
			peerState.shutdown()
		},
	}
}

async function logInWithPassphrase(args: {
	config: CliConfig
	passphrase: string
}) {
	ensureCliKvStore(args.config.authFile)
	let authSecretStorage = new AuthSecretStorage()
	let crypto = await WasmCrypto.create()
	let peerState = createPeerState(args.config.syncPeer)
	let secretSeed = mnemonicToEntropy(args.passphrase, wordlist)
	let accountSecret = crypto.agentSecretFromSecretSeed(secretSeed)
	let accountID = cojsonInternals.idforHeader(
		cojsonInternals.accountHeaderForInitialAgentSecret(accountSecret, crypto),
		crypto,
	) as ID<typeof UserAccount>

	let context = await createJazzContextFromExistingCredentials({
		credentials: {
			accountID,
			secret: accountSecret,
		},
		peers: peerState.peers,
		crypto,
		AccountSchema: UserAccount,
		sessionProvider: new MockSessionProvider(),
		asActiveAccount: true,
	})
	peerState.attach(context.node)

	let loaded = await context.account.$jazz.ensureLoaded({
		resolve: { profile: true, root: { documents: true } },
	})
	await authSecretStorage.set({
		accountID: loaded.$jazz.id,
		accountSecret,
		secretSeed,
		provider: "passphrase",
	})

	return {
		account: loaded,
		async done() {
			context.done()
			peerState.shutdown()
		},
	}
}

async function logOut(config: CliConfig): Promise<void> {
	ensureCliKvStore(config.authFile)
	let authSecretStorage = new AuthSecretStorage()
	await authSecretStorage.clear()
}

async function getStoredCredentials(config: CliConfig) {
	ensureCliKvStore(config.authFile)
	let authSecretStorage = new AuthSecretStorage()
	return authSecretStorage.get()
}

async function getPassphraseFromStorage(config: CliConfig): Promise<string> {
	ensureCliKvStore(config.authFile)
	let authSecretStorage = new AuthSecretStorage()
	let credentials = await authSecretStorage.get()
	if (!credentials?.secretSeed) {
		throw new AuthError({ message: "No stored passphrase" })
	}
	return entropyToMnemonic(credentials.secretSeed, wordlist)
}

async function generatePassphrase(): Promise<string> {
	let crypto = await WasmCrypto.create()
	return entropyToMnemonic(crypto.newRandomSecretSeed(), wordlist)
}

function createPeerState(syncPeer: string) {
	let peers: Peer[] = []
	let node: Loaded<typeof UserAccount>["$jazz"]["localNode"] | null = null
	let websocketPeer = new WebSocketPeerWithReconnection({
		peer: syncPeer,
		reconnectionTimeout: 100,
		addPeer(peer) {
			if (node) {
				node.syncManager.addPeer(peer)
				return
			}
			peers.push(peer)
		},
		removePeer() {},
		WebSocketConstructor: WebSocket,
	})
	websocketPeer.enable()

	return {
		peers,
		attach(nextNode: Loaded<typeof UserAccount>["$jazz"]["localNode"]) {
			node = nextNode
			for (let peer of peers) {
				node.syncManager.addPeer(peer)
			}
			peers = []
		},
		shutdown() {
			websocketPeer.disable()
		},
	}
}
