import 'reflect-metadata';
import './env.ts';

import * as TypeORM from 'typeorm';
import * as TypeGraphQL from 'type-graphql';
import * as jwt from 'express-jwt';

import queryComplexity from 'graphql-query-complexity';
import { fieldConfigEstimator, simpleEstimator } from 'graphql-query-complexity';

import { ApolloServer } from 'apollo-server-express';
import { formatError } from 'apollo-errors';
import * as Express from 'express';
import { Container } from 'typedi';
import { Context } from './common/context.interface';
import { authChecker } from './auth-checker';

import { Invitee } from './entities/invitee';
import { Invitation } from './entities/invitation';

import { InviteeResolver } from './resolvers/invitee-resolver';
import { InvitationResolver } from './resolvers/invitation-resolver';
import { AuthResolver } from './resolvers/auth-resolver';

TypeGraphQL.useContainer(Container);
TypeORM.useContainer(Container);

async function bootstrap() {
    let schema;

    try {
        // Move config to file?
        await TypeORM.createConnection({
            type: 'postgres',
            database: process.env.DB_NAME,
            username: process.env.DB_USER,
            password: process.env.DB_PASS,
            port: parseInt(process.env.DB_PORT),
            host: process.env.DB_HOST,
            entities: [
                Invitee,
                Invitation
            ],
            synchronize: true,
            logger: 'advanced-console',
            logging: true,
            dropSchema: false,
            cache: true,
        });
    } catch(error) { console.log('error', error) }

    try {
        schema = await TypeGraphQL.buildSchema({
            resolvers: [
                InvitationResolver,
                InviteeResolver,
                AuthResolver
            ],
            authChecker
        });
    } catch (error) { console.log('error', error) }

    const apolloServer = new ApolloServer({
        schema,
        formatError,
        // formatError: formatArgumentValidationError,
        context: ({ req, res }: any): Context => {
            return {
                tokenData: req.tokenData
            }
        },
        validationRules: [
          queryComplexity({
            // The maximum allowed query complexity, queries above this threshold will be rejected
            maximumComplexity: 30,
            // The query variables. This is needed because the variables are not available
            // in the visitor of the graphql-js library
            variables: {},
            // Optional callback function to retrieve the determined query complexity
            // Will be invoked weather the query is rejected or not
            // This can be used for logging or to implement rate limiting
            onComplete: (complexity: number) => {
              console.log("Query Complexity:", complexity);
            },
            estimators: [
              // Using fieldConfigEstimator is mandatory to make it work with type-graphql
              fieldConfigEstimator(),
              // This will assign each field a complexity of 1 if no other estimator
              // returned a value. We can define the default value for field not explicitly annotated
              simpleEstimator({
                defaultComplexity: 1
              })
            ]
          }) as any
        ]
    });

    const app = Express();

    app.use('/graphql',
        jwt({
            secret: process.env.JWT_SECRET,
            credentialsRequired: false,
            userProperty: 'tokenData',
        })
    );

    apolloServer.applyMiddleware({ app });

    app.listen(4000, () => {
        console.log("server started on http://localhost:4000/graphql");
    });
}

try {
    bootstrap();
} catch (error) { console.log('error', error) }
