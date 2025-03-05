import type { HttpContext } from '@adonisjs/core/http'
import { createUser } from '#validators/user'
import User from '#models/user'

export default class UsersController {
  public async store({ request, response }: HttpContext) {
    const data = request.all()
    const payload = await createUser.validate(data)

    const user = await User.create(payload)

    return response.created(user)
  }
}
