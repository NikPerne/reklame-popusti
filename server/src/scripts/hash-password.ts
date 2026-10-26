/**
 * Prints an argon2 hash for APP_PASSWORD_HASH: `npm run hash-password -w server`.
 * The password is read without echoing it to the terminal.
 */
import { hash } from '@node-rs/argon2';

const MIN_LENGTH = 12;

function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new Error('Run this in an interactive terminal.');

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let input = '';
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(input);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Cancelled'));
          return;
        }
        input = char === '\u007f' || char === '\b' ? input.slice(0, -1) : input + char;
      }
    };
    const cleanup = (): void => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

const password = await readHidden('Password: ');
if (password.length < MIN_LENGTH) {
  console.error(`Use at least ${MIN_LENGTH} characters.`);
  process.exit(1);
}
if ((await readHidden('Repeat:   ')) !== password) {
  console.error('Passwords do not match.');
  process.exit(1);
}

console.log(`\nAPP_PASSWORD_HASH='${await hash(password)}'`);
