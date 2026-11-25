#!/usr/bin/env node
// Read from stdin so passwords do not appear in process arguments/history.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
let password = '';
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, '');
if (!password) { console.error('Pipe a password to stdin.'); process.exit(1); }
const salt = randomBytes(16);
console.log(`pbkdf2$100000$${salt.toString('base64')}$${pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64')}`);
