export { getRandomWriterName }

function getRandomWriterName(): string {
	let adjIndex = Math.floor(Math.random() * adjectives.length)
	let nameIndex = Math.floor(Math.random() * writerNames.length)
	return `${adjectives[adjIndex]} ${writerNames[nameIndex]}`
}

let adjectives = [
	"Wandering",
	"Dreaming",
	"Curious",
	"Pensive",
	"Restless",
	"Eloquent",
	"Brooding",
	"Whimsical",
	"Melancholy",
	"Luminous",
	"Wistful",
	"Serene",
	"Fierce",
	"Gentle",
	"Bold",
	"Quiet",
	"Wild",
	"Tender",
	"Radiant",
	"Somber",
]

let writerNames = [
	"Hemingway",
	"Woolf",
	"Borges",
	"Austen",
	"Kafka",
	"Tolstoy",
	"Dickinson",
	"Márquez",
	"Plath",
	"Orwell",
	"Dostoevsky",
	"Brontë",
	"Neruda",
	"Camus",
	"Sappho",
	"Rumi",
	"Murasaki",
	"Cervantes",
	"Poe",
	"Whitman",
	"Yeats",
	"Rilke",
	"Tagore",
	"Pessoa",
	"Lispector",
	"Baldwin",
	"Achebe",
	"Atwood",
	"Morrison",
	"Rushdie",
]
