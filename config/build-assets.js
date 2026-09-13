// Minifica os assets estáticos do site público (JS/CSS) para o diretório
// public/dist/. As views usam as versões .min quando NODE_ENV=production —
// os arquivos originais continuam servidos em desenvolvimento para facilitar
// o debugging.
//
// Rode com: npm run build:assets
const fs = require('fs');
const path = require('path');
const terser = require('terser');
const CleanCSS = require('clean-css');

const publicDir = path.join(__dirname, '..', 'public');
const distDir = path.join(publicDir, 'dist');

const JS_SOURCES = ['js/site.js', 'js/cart.js'];
const CSS_SOURCES = ['css/site.css', 'css/admin.css'];

async function main() {
  fs.mkdirSync(distDir, { recursive: true });
  const results = [];

  for (const rel of JS_SOURCES) {
    const filePath = path.join(publicDir, rel);
    const code = fs.readFileSync(filePath, 'utf8');
    const out = await terser.minify(code, { compress: true, mangle: true });
    if (out.error) throw out.error;
    const outFile = path.join(distDir, path.basename(rel).replace(/\.js$/, '.min.js'));
    fs.writeFileSync(outFile, out.code);
    results.push(`${rel} -> dist/${path.basename(outFile)} (${(out.code.length / 1024).toFixed(1)} KB)`);
  }

  for (const rel of CSS_SOURCES) {
    const filePath = path.join(publicDir, rel);
    const css = fs.readFileSync(filePath, 'utf8');
    const out = new CleanCSS({ level: 2 }).minify(css);
    if (out.errors && out.errors.length) throw new Error(out.errors.join('\n'));
    const outFile = path.join(distDir, path.basename(rel).replace(/\.css$/, '.min.css'));
    fs.writeFileSync(outFile, out.styles);
    results.push(`${rel} -> dist/${path.basename(outFile)} (${(out.styles.length / 1024).toFixed(1)} KB)`);
  }

  // Manifesta a lista de assets minificados (as views consultam via app.locals.assets)
  fs.writeFileSync(
    path.join(distDir, 'manifest.json'),
    JSON.stringify(
      {
        js: JS_SOURCES.map((s) => `dist/${path.basename(s).replace(/\.js$/, '.min.js')}`),
        css: CSS_SOURCES.map((s) => `dist/${path.basename(s).replace(/\.css$/, '.min.css')}`),
      },
      null,
      2
    )
  );
  results.push('manifest.json escrito em public/dist/');
  console.log(results.join('\n'));
}

main().catch((err) => {
  console.error('Falha ao minificar assets:', err);
  process.exit(1);
});