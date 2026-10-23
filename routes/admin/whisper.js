const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const whisper = require('../../lib/whisper');

// Diretório de mídia onde ficam os arquivos para transcrição
const MEDIA_DIR = whisper.WHISPER_MEDIA_DIR;

// Lista arquivos de áudio/vídeo disponíveis na pasta de mídia
function listarArquivosMedia() {
  if (!fs.existsSync(MEDIA_DIR)) return [];
  return fs
    .readdirSync(MEDIA_DIR)
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ['.mp4', '.mp3', '.wav', '.mpeg', '.mpga', '.m4a', '.ogg', '.webm'].includes(ext);
    })
    .sort()
    .map((f) => ({
      nome: f,
      caminho: path.join(MEDIA_DIR, f),
      tamanho: (fs.statSync(path.join(MEDIA_DIR, f)).size / 1024 / 1024).toFixed(2) + ' MB',
    }));
}

// GET /admin/whisper — página de transcrição
router.get('/', async (req, res) => {
  const arquivos = listarArquivosMedia();
  const modelos = whisper.listarModelos();
  const msg = String(req.query.msg || '');
  const erro = String(req.query.erro || '');

  res.render('admin/whisper', {
    arquivos,
    modelos,
    msg,
    erro,
    mediaDir: MEDIA_DIR,
    dockerOk: await whisper.dockerDisponivel(),
    imagemOk: await whisper.imagemDisponivel(),
  });
});

// POST /admin/whisper/transcrever — dispara a transcrição de um arquivo
router.post('/transcrever', async (req, res) => {
  const { arquivo, model = 'base', language = 'pt', outputFormat = 'txt' } = req.body;

  if (!arquivo) {
    return res.redirect('/admin/whisper?erro=' + encodeURIComponent('Informe o arquivo para transcrever.'));
  }

  const caminhoArquivo = path.resolve(MEDIA_DIR, arquivo);

  try {
    const resultado = await whisper.transcrever(caminhoArquivo, {
      model,
      language,
      outputFormat,
    });

    const nomeSaida = path.basename(resultado.outputFile);
    return res.redirect(
      `/admin/whisper?msg=${encodeURIComponent(
        `Transcrição concluída: ${nomeSaida}`
      )}`
    );
  } catch (err) {
    return res.redirect(
      `/admin/whisper?erro=${encodeURIComponent(err.message || 'Falha ao transcrever.')}`
    );
  }
});

module.exports = router;
