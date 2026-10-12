import { randomBytes } from "node:crypto";
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export interface UserAccount {
  username: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  enabled: boolean;
  status: string;
}

// The accounts in the Cognito user pool. invite makes the same two calls as
// scripts/add-user.sh; "exists" means the username was already taken and
// nothing was changed. The sign-in username can't change, so the name a person
// picks is the standard preferred_username attribute: getProfile reads it (null
// until chosen) and setDisplayName writes it, answering "taken" when another
// account already has it. list is everyone, oldest first.
export interface UserDirectory {
  invite(input: { username: string; email: string }): Promise<"created" | "exists">;
  getProfile(username: string): Promise<{ displayName: string | null }>;
  setDisplayName(username: string, displayName: string): Promise<"set" | "taken">;
  list(): Promise<UserAccount[]>;
}

function attribute(attrs: { Name?: string; Value?: string }[] | undefined, name: string) {
  return attrs?.find((a) => a.Name === name)?.Value ?? null;
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
    async getProfile(username) {
      const user = await client.send(
        new AdminGetUserCommand({ UserPoolId: opts.userPoolId, Username: username }),
      );
      return { displayName: attribute(user.UserAttributes, "preferred_username") };
    },
    async setDisplayName(username, displayName) {
      // displayName never contains a double quote (the route rejects it), so it
      // can sit inside the filter's quotes as is.
      const found = await client.send(
        new ListUsersCommand({
          UserPoolId: opts.userPoolId,
          Filter: `preferred_username = "${displayName}"`,
          Limit: 1,
        }),
      );
      if ((found.Users ?? []).some((u) => u.Username !== username)) return "taken";
      await client.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: opts.userPoolId,
          Username: username,
          UserAttributes: [{ Name: "preferred_username", Value: displayName }],
        }),
      );
      return "set";
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
            email: attribute(u.Attributes, "email"),
            displayName: attribute(u.Attributes, "preferred_username"),
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
