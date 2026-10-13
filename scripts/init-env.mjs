// Creates each workspace's local env file from its committed example. Never overwrites.
import { copyFileSync, existsSync } from 'node:fs';

const files = [
  ['.env.example', '.env'],
  ['apps/api/.env.example', 'apps/api/.env'],
  ['apps/worker/.env.example', 'apps/worker/.env'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
  ['packages/db/.env.example', 'packages/db/.env'],
];

for (const [example, target] of files) {
  if (existsSync(target)) {
    console.log(`kept     ${target}`);
  } else {
    copyFileSync(example, target);
    console.log(`created  ${target}`);
  }
}
