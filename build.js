#!/usr/bin/env node
// Builds the app: src/ -> dist/index.html (one self-contained file, same as before).
//   src/index.html   page shell with <!-- build:css --> and <!-- build:js --> markers
//   src/css/*.css    styles, joined in file-name order
//   src/js/*.js      scripts, joined in file-name order into one <script>
// No dependencies: `node build.js` is all it takes. `node build.js --check` fails if
// a marker is missing or a file is empty, without writing anything.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = __dirname, src = path.join(root, 'src');

function joinDir(dir, ext){
  const files = fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort();
  if(!files.length) throw new Error('no ' + ext + ' files in ' + dir);
  return files.map(f => {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    if(!t.trim()) throw new Error(f + ' is empty');
    return t;
  }).join('');
}
function once(text, marker){
  const i = text.indexOf(marker);
  if(i < 0 || text.indexOf(marker, i + 1) >= 0) throw new Error('src/index.html needs exactly one ' + marker);
  return i;
}

const shell = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
once(shell, '<!-- build:css -->'); once(shell, '<!-- build:js -->'); once(shell, 'content="__BUILD__"');
let html = shell
  .replace('<!-- build:css -->', () => joinDir(path.join(src, 'css'), '.css'))
  .replace('<!-- build:js -->', () => joinDir(path.join(src, 'js'), '.js'));
// the build tag changes whenever anything changes, so phones notice there's an update
const tag = crypto.createHash('sha1').update(html).digest('hex').slice(0, 10);
html = html.replace('content="__BUILD__"', 'content="' + tag + '"');

if(process.argv.includes('--check')){ console.log('ok: build ' + tag + ', ' + html.length + ' bytes'); process.exit(0); }
fs.mkdirSync(path.join(root, 'dist'), {recursive: true});
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
console.log('built dist/index.html: build ' + tag + ', ' + Math.round(html.length / 1024) + ' KB');
