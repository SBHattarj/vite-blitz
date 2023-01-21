import Tokens from "csrf"

export const tokens = new Tokens({
    saltLength: 16,
    secretLength: 32
})