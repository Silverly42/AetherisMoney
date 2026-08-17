const fs = require('node:fs');
const minecraft = require('minecraft-data')('1.21.5');

// Items that exist in the creative inventory/registry but cannot legitimately
// be obtained as an item in an ordinary survival world.
const unobtainable = new Set([
  'Air','Barrier','Bedrock','Budding Amethyst','Chain Command Block','Command Block',
  'Chorus Plant','Command Block Minecart','Debug Stick','Dirt Path','End Gateway','End Portal',
  'End Portal Frame','Farmland','Fire','Frogspawn','Frosted Ice','Jigsaw','Knowledge Book',
  'Light','Nether Portal','Petrified Oak Slab','Reinforced Deepslate','Suspicious Gravel','Suspicious Sand',
  'Player Head','Repeating Command Block','Spawner','Structure Block','Structure Void','Test Block',
  'Test Instance Block','Trial Spawner','Vault','Water','Lava'
]);
const names = [...new Set(minecraft.itemsArray.map(item => item.displayName))]
  .filter(name => !unobtainable.has(name) && !name.endsWith(' Spawn Egg') && !name.startsWith('Infested '))
  .sort();
fs.writeFileSync('public/minecraft-blocks.js', `window.MINECRAFT_ITEMS=${JSON.stringify(names)};\nwindow.MINECRAFT_BLOCKS=window.MINECRAFT_ITEMS;\n`);
