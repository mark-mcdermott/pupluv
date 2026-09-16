import { hashPin, MIN_PIN_LENGTH } from '../src/server/auth'

const pin = process.argv[2]

if (!pin || pin.length < MIN_PIN_LENGTH) {
  console.error(`usage: pnpm pin:hash <pin>   (at least ${MIN_PIN_LENGTH} characters)`)
  process.exit(1)
}

console.log(await hashPin(pin))
