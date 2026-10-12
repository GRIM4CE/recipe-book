import { randomBytes } from "node:crypto";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export interface UserAccount {
  username: string;
  email: string | null;
  createdAt: string;
  enabled: boolean;
  status: string;
}

// The accounts in the Cognito user pool. invite makes the same two calls as
// scripts/add-user.sh; "exists" means the username was already taken and
// nothing was changed. list is everyone, oldest first.
export interface UserDirectory {
  invite(input: { username: string; email: string }): Promise<"created" | "exists">;
  list(): Promise<UserAccount[]>;
}

export function createCognitoDirectory(opts: {
  userPoolId: string;
  region: string;
}): UserDirectory {
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
    async list() {
      const users: UserAccount[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListUsersCommand({
            UserPoolId: opts.userPoolId,
            Limit: 60,
            PaginationToken: token,
          }),
        );
        for (const u of page.Users ?? []) {
          users.push({
            username: u.Username ?? "",
            email: u.Attributes?.find((a) => a.Name === "email")?.Value ?? null,
            createdAt: (u.UserCreateDate ?? new Date(0)).toISOString(),
            enabled: u.Enabled ?? true,
            status: u.UserStatus ?? "",
          });
        }
        token = page.PaginationToken;
      } while (token);
      return users.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}
