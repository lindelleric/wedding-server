import jwt from 'jsonwebtoken';

import { Resolver, Mutation, Query, Authorized, Arg, Ctx } from 'type-graphql';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { Repository } from 'typeorm';

import { CodeNotFoundError } from './errors/CodeNotFoundError';
import discord from './../middlewares/discord';

import { Context } from './../common/context.interface';
import { Invitation } from './../entities/invitation';

@Resolver()
export class AuthResolver {
    constructor(@InjectRepository(Invitation) private invitationRepository: Repository<Invitation>) {}

    @Mutation(returns => String)
    public async authenticate(@Arg('invitationCode') invitationCode: string) {
        const invitation = await this.invitationRepository.findOne({
            where: {
                code: invitationCode
            }
        });

        if (invitation) {
            discord.success(invitation.title.slice(0, 31), 'Har loggat in');
            return jwt.sign(
                {
                    invitationId: invitation.id,
                    role: invitation.role
                },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN }
            );
        } else {
            discord.err('Error', `Koden: ${ invitationCode }, finns inte.`);
            throw new CodeNotFoundError();
        }

        return;
    }
}
