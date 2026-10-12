import { randomBytes } from "node:crypto";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";

// Creates accounts in the Cognito user pool, the same two calls as
// scripts/add-user.sh. "exists" means the username was already taken and
// nothing was changed.
export interface UserInviter {
  invite(input: { username: string; email: string }): Promise<"created" | "exists">;
}

export function createCognitoInviter(opts: {
  userPoolId: string;
  region: string;
}): UserInviter {
  const client = new CognitoIdentityProviderClient({ region: opts.region });
  return {
    async invite({ username, email }) {
      try {
        await client.send(
          new AdminCreateUserCommand({
            UserPoolId: opts.userPoolId,
            Username: username,
            UserAttributes: [
              { Name: "email", Value: email },
              { Name: "email_verified", Value: "true" },
            ],
            // No invitation email: the owner tells the person how to sign in.
            MessageAction: "SUPPRESS",
          }),
        );
      } catch (err) {
        if (err instanceof Error && err.name === "UsernameExistsException") {
          return "exists";
        }
        throw err;
      }
      // Only clears Cognito's initial challenge state; the app client has no
      // password flow, so nobody ever signs in with this password.
      await client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: opts.userPoolId,
          Username: username,
          Password: randomBytes(24).toString("base64"),
          Permanent: true,
        }),
      );
      return "created";
    },
  };
}
