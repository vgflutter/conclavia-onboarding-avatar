import { productionErrors } from './production-config.mjs';

const errors = productionErrors(process.env);
if (errors.length) {
  console.error(`Production configuration rejected:\n${errors.map(error => `- ${error}`).join('\n')}`);
  process.exit(1);
}
console.log('Production configuration valid. Connectivity and provider credentials still require verification.');
