import vine from '@vinejs/vine'

export const createUser = vine.compile(
  vine.object({
    name: vine.string().trim(),
    email: vine.string().email(),
    password: vine.string().minLength(6),
  })
)
