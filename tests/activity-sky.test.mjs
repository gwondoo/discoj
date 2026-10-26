import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from '../activity/node_modules/typescript/lib/typescript.js';
// Execute the real skyAt declaration without importing React/TSX into Node.
const file = await readFile(new URL('../activity/src/components/DjBooth.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('DjBooth.tsx', file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'skyAt');
assert.ok(declaration);
const js = ts.transpileModule(declaration.getText(ast), {compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {skyAt} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
for (const [hour, expected] of [[0,'night'],[8.999,'night'],[9,'morning'],[10.999,'morning'],[11,'day'],[13.999,'day'],[14,'evening'],[15.999,'evening'],[16,'night'],[18,'night'],[23.999,'night']]) {
  assert.equal(skyAt(hour), expected, `hour ${hour}`);
}
assert.deepEqual([...new Set(Array.from({length:9}, (_,i) => skyAt(9+i)))], ['morning','day','evening','night']);
console.log('Sky tests passed: all four moods during office hours, exact boundaries, overnight');
