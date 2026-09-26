/** Offline validation. Return variable names and rules, never configured values. */
export function productionErrors(env) {
  const errors = [];
  const present = key => typeof env[key] === 'string' && env[key].trim().length > 0;
  try {
    const url = new URL(env.ONBOARDING_BASE_URL);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || /\.(localhost|example|invalid|test)$/u.test(url.hostname);
    if (url.protocol !== 'https:' || local || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) throw new Error();
  } catch {
    errors.push('ONBOARDING_BASE_URL: configure a public HTTPS origin without path, query or credentials');
  }
  if (!present('MONGODB_URI') || !/^mongodb(?:\+srv)?:\/\/\S+$/u.test(env.MONGODB_URI))
    errors.push('MONGODB_URI: configure the existing MongoDB connection');
  if (!present('MONGODB_DB_NAME'))
    errors.push('MONGODB_DB_NAME: explicitly select the existing application database');
  for (const key of ['ONBOARDING_ADMIN_TOKEN', 'ONBOARDING_SESSION_SECRET']) {
    if (!present(key) || env[key].length < 32 || /^(replace|change|example|test-|demo-|your-)/iu.test(env[key]))
      errors.push(`${key}: configure an independently generated credential of at least 32 characters`);
  }
  if (present('ONBOARDING_ADMIN_TOKEN') && env.ONBOARDING_ADMIN_TOKEN === env.ONBOARDING_SESSION_SECRET)
    errors.push('ONBOARDING_ADMIN_TOKEN and ONBOARDING_SESSION_SECRET: use different credentials');
  if (!['true', 'false'].includes(env.ONBOARDING_AI_ENABLED))
    errors.push('ONBOARDING_AI_ENABLED: explicitly select true or false');
  if (env.ONBOARDING_AI_ENABLED === 'true') {
    for (const key of ['OPENAI_API_KEY', 'INWORLD_API_KEY']) {
      if (!present(key)) errors.push(`${key}: required for the production voice onboarding`);
    }
    if (present('OPENAI_TRANSCRIPTION_MODEL')
      && !['gpt-4o-transcribe', 'gpt-4o-mini-transcribe'].includes(env.OPENAI_TRANSCRIPTION_MODEL))
      errors.push('OPENAI_TRANSCRIPTION_MODEL: select a supported transcription model with automatic turns');
  }
  return errors;
}
