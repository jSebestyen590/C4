import {
  AliasExistsException,
  CodeMismatchException,
  CognitoIdentityProviderClient,
  ExpiredCodeException,
  NotAuthorizedException,
  UpdateUserAttributesCommand,
  VerifyUserAttributeCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/** The access token lacks the user-admin scope, e.g. it was issued before the scope existed. */
export class NeuAnmeldungNoetig extends Error {}
export class EmailVergeben extends Error {}
export class CodeUngueltig extends Error {}

/**
 * Changes the caller's own email with Cognito's verification flow. The calls authenticate with the
 * user's access token, so they need no IAM permissions; the old address stays valid until the code
 * sent to the new one is confirmed.
 */
export interface EmailAenderung {
  anfordern(accessToken: string, email: string): Promise<void>;
  bestaetigen(accessToken: string, code: string): Promise<void>;
}

export function createCognitoEmailAenderung(region: string): EmailAenderung {
  const client = new CognitoIdentityProviderClient({ region });
  return {
    async anfordern(accessToken, email) {
      try {
        await client.send(
          new UpdateUserAttributesCommand({
            AccessToken: accessToken,
            UserAttributes: [{ Name: 'email', Value: email }],
          }),
        );
      } catch (err) {
        if (err instanceof NotAuthorizedException) throw new NeuAnmeldungNoetig();
        if (err instanceof AliasExistsException) throw new EmailVergeben();
        throw err;
      }
    },
    async bestaetigen(accessToken, code) {
      try {
        await client.send(
          new VerifyUserAttributeCommand({
            AccessToken: accessToken,
            AttributeName: 'email',
            Code: code,
          }),
        );
      } catch (err) {
        if (err instanceof NotAuthorizedException) throw new NeuAnmeldungNoetig();
        if (err instanceof AliasExistsException) throw new EmailVergeben();
        if (err instanceof CodeMismatchException || err instanceof ExpiredCodeException)
          throw new CodeUngueltig();
        throw err;
      }
    },
  };
}
