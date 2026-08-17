const fs = require('node:fs');
const minecraft = require('minecraft-data')('1.21.5');

const names = [...new Set(minecraft.blocksArray.map(block => block.displayName))].sort();
fs.writeFileSync('public/minecraft-blocks.js', `window.MINECRAFT_BLOCKS=${JSON.stringify(names)};\n`);
