import db from '@adonisjs/lucid/services/db'
import User from '#modules/users/models/user'
import { preserveProfessionalIdentity } from '#modules/professionals/services/preserve_professional_identity'
import { inject } from '@adonisjs/core'
import UserManagementPolicyService from '#modules/users/services/user_management_policy_service'

@inject()
export default class DeleteUserService {
  constructor(private userManagementPolicy: UserManagementPolicyService) {}

  async run(userId: number, actorId: number): Promise<void> {
    await this.userManagementPolicy.assertCanManage(actorId, userId)
    await db.transaction(async (trx) => {
      const user = await User.query({ client: trx }).where('id', userId).forUpdate().firstOrFail()
      await preserveProfessionalIdentity(userId, trx)
      user.is_deleted = true
      await user.save()
    })
  }
}
