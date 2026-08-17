const test = require('node:test');
const assert = require('node:assert/strict');
const { initialDb, amount } = require('./server');
const fs = require('node:fs');
test('seeds the requested accounts',()=>assert.deepEqual(initialDb().users.map(u=>u.name),['Lucca','Conor','Rhys','Aleesha']));
test('accepts whole positive amounts',()=>assert.equal(amount('25'),25));
test('rejects invalid amounts',()=>{assert.throws(()=>amount(0));assert.throws(()=>amount(1.5));assert.throws(()=>amount('no'))});
test('shows the current sell prices',()=>{
  const html = fs.readFileSync('./public/index.html','utf8');
  for (const entry of ['Diamond</span><strong>5,000 M$','Lapis Lazuli</span><strong>125 M$','Netherite Ingot</span><strong>25,000 M$','Oak Log</span><strong>5 M$','Cherry Log</span><strong>5 M$','Netherrack</span><strong>5 M$','Any mob drop music disc</span><strong>10,000 M$']) assert.match(html,new RegExp(entry.replace('$','\\$')));
});
