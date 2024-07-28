const { v4: uuidv4 } = require('uuid');
const crypto = require('node:crypto');
require('dotenv').config();

const hashPassword = (password) => crypto.pbkdf2Sync(password, process.env.SALT, 10000, 64, 'sha512').toString('hex');

const token = uuidv4();
const hashed = hashPassword(token);

console.log(`Token: ${token}`)
console.log(`Token Hash: ${hashed}`);

setTimeout(() => {
  const secondHash = hashPassword(token);
  console.log(`Token Hash: ${secondHash}`);
}, 100);