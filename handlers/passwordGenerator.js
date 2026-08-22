const crypto = require('node:crypto');

const GROUPS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  'abcdefghijkmnopqrstuvwxyz',
  '23456789',
  '!@#$%&',
];
const ALL = GROUPS.join('');

function randomCharacter(characters) {
  return characters[crypto.randomInt(0, characters.length)];
}

function secureShuffle(characters) {
  const result = [...characters];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result.join('');
}

function generatePassword(length = 12) {
  const safeLength = Math.max(12, Number(length) || 12);
  const required = GROUPS.map(randomCharacter);
  while (required.length < safeLength) required.push(randomCharacter(ALL));
  return secureShuffle(required);
}

module.exports = generatePassword;
