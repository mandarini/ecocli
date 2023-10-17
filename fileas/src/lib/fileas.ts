import path from 'path';
import * as fs from 'fs';
export function fileas(): string {
  const katerpath = path.join('kater', 'test.txt');
  fs.writeFileSync(katerpath, 'this is kater', 'utf-8');
  console.log('This is fileas');
  return 'fileas';
}
