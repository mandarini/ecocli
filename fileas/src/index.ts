export * from './lib/fileas';
import path from 'path';
import * as fs from 'fs';

const katerpath = path.join('kater', 'test.txt');
fs.mkdirSync('kater');
fs.writeFileSync(katerpath, 'this is kater', 'utf-8');
console.log('This is fileas outer');
