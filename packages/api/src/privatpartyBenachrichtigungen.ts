import { ROLE_PERMISSIONS, type PostenRecht } from '@c4/shared';
import type { UserAdmin } from './admin';
import type { PostenStore } from './posten';

// Recipients of Privatparty messages: everybody who may manage Privatpartys (see
// docs/privatpartys.md and docs/benachrichtigungen.md).

/**
 * Subs of all members who currently have `recht`: holders of a Posten that grants it, plus admins
 * (their Cognito group grants it too). Deactivated members drop out later in `senden`.
 */
export async function mitgliederMitRecht(
  deps: { posten: Pick<PostenStore, 'inhaberMitRecht'>; userAdmin: Pick<UserAdmin, 'rollen'> },
  recht: PostenRecht,
  heute?: string,
): Promise<string[]> {
  const [inhaber, rollen] = await Promise.all([
    deps.posten.inhaberMitRecht(recht, heute),
    deps.userAdmin.rollen(),
  ]);
  const admins = [...rollen]
    .filter(([, r]) =>
      r.some((rolle) =>
        (
          ROLE_PERMISSIONS[rolle as keyof typeof ROLE_PERMISSIONS] as readonly string[] | undefined
        )?.includes(recht),
      ),
    )
    .map(([sub]) => sub);
  return [...new Set([...inhaber, ...admins])];
}
