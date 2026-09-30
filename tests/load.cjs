// Node からブラウザ用スクリプトを読み込むための小さなローダー（DOM を使わないモジュールのみ）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

globalThis.window = globalThis;
const root = path.join(__dirname, '..', 'js');

function load(files) {
  for (const f of files) {
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    vm.runInThisContext(code, { filename: f });
  }
  return globalThis.SL;
}

module.exports = { load };
