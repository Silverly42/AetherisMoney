const test = require('node:test');
const assert = require('node:assert/strict');
const { initialDb, amount } = require('./server');
test('seeds the requested accounts',()=>assert.deepEqual(initialDb().users.map(u=>u.name),['Lucca','Conor','Rhys','Aleesha']));
test('accepts whole positive amounts',()=>assert.equal(amount('25'),25));
test('rejects invalid amounts',()=>{assert.throws(()=>amount(0));assert.throws(()=>amount(1.5));assert.throws(()=>amount('no'))});
