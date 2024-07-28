const crypto = require('node:crypto');
require('dotenv').config();

const hashPassword = (password) => crypto.pbkdf2Sync(password, process.env.SALT, 10000, 64, 'sha512').toString('hex');

console.log(hashPassword('76ea4710-0d09-4a08-ac65-34473d400af1'));