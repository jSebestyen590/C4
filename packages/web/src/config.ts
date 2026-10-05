import { appConfigSchema, type AppConfig } from '@c4/shared';

/** Runtime config written by Terraform to /app/config.json (one build serves every env). */
export async function loadAppConfig(): Promise<AppConfig> {
  const res = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load config.json (${res.status})`);
  return appConfigSchema.parse(await res.json());
}
