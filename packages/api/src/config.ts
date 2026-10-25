export interface Config {
  region: string;
  userPoolId: string;
  clientId: string;
  dsqlEndpoint: string;
  profilbildBucket: string;
  /** Public origin of the web app for links in the calendar feed; unset = no links. */
  appUrl?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = (key: string): string => {
    const value = env[key];
    if (!value) throw new Error(`Missing environment variable ${key}`);
    return value;
  };
  return {
    region: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? 'eu-central-1',
    userPoolId: need('USER_POOL_ID'),
    clientId: need('CLIENT_ID'),
    dsqlEndpoint: need('DSQL_ENDPOINT'),
    profilbildBucket: need('PROFILBILD_BUCKET'),
    ...(env.PUBLIC_URL && { appUrl: env.PUBLIC_URL.replace(/\/+$/, '') }),
  };
}
