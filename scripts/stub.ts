/**
 * Placeholder for npm scripts whose work belongs to a later stage (§8).
 * Usage: tsx scripts/stub.ts <script name> <stage>
 */
const [script = '?', stage = '?'] = process.argv.slice(2);
console.log(`npm run ${script}: заглушка, скрипт появится на Этапе ${stage} (docs/TZ.md §8).`);

export {};
