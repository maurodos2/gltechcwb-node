/**
 * lib/whisper.js — Transcrição de áudio/vídeo via OpenAI Whisper (Docker)
 *
 * Usa o container oficial openai/whisper via child_process.
 * O container monta um volume local para ler o arquivo de origem e
 * gravar o arquivo de transcrição no mesmo diretório.
 *
 * Requisitos no servidor:
 *   - Docker instalado e em execução
 *   - Imagem: docker pull openai/whisper:latest
 *
 * Uso:
 *   const whisper = require('./lib/whisper');
 *   const resultado = await whisper.transcrever('/caminho/video.mp4', {
 *     model: 'base',        // tiny | base | small | medium | large-v3
 *     language: 'pt',       // idioma da transcrição
 *     outputFormat: 'txt',  // txt | vtt | srt | tsv | json
 *   });
 *   // resultado.outputFile -> caminho do arquivo .txt gerado
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execFileAsync = promisify(execFile);

const DOCKER_IMAGE = 'gltechcwb/whisper:latest';

// Diretório onde arquivos de mídia aguardam transcrição.
// Pode ser sobrescrito pela env WHISPER_MEDIA_DIR.
const WHISPER_MEDIA_DIR = process.env.WHISPER_MEDIA_DIR ||
  path.resolve(__dirname, '../public/uploads/whisper');

// Garante que o diretório exista
if (!fs.existsSync(WHISPER_MEDIA_DIR)) {
  fs.mkdirSync(WHISPER_MEDIA_DIR, { recursive: true });
}

/**
 * Valida se o Docker está disponível no host.
 */
async function dockerDisponivel() {
  try {
    await execFileAsync('docker', ['--version'], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica se a imagem do Whisper está disponível localmente.
 */
async function imagemDisponivel() {
  try {
    const { stdout } = await execFileAsync(
      'docker', ['images', '-q', DOCKER_IMAGE],
      { maxBuffer: 1024 * 1024 }
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Transcreve um arquivo de áudio/vídeo usando o Whisper via Docker.
 *
 * @param {string} arquivo - Caminho absoluto do arquivo de mídia.
 * @param {Object} opts - Opções de transcrição.
 * @param {string} [opts.model='base'] - Modelo Whisper (tiny, base, small, medium, large-v3).
 * @param {string} [opts.language='pt'] - Código do idioma (pt, en, es...).
 * @param {string} [opts.outputFormat='txt'] - Formato de saída (txt, vtt, srt, tsv, json).
 * @returns {Promise<{ outputFile: string, stdout: string, stderr: string }>}
 */
async function transcrever(arquivo, opts = {}) {
  const {
    model = 'base',
    language = 'pt',
    outputFormat = 'txt',
  } = opts;

  if (!fs.existsSync(arquivo)) {
    const err = new Error(`Arquivo não encontrado: ${arquivo}`);
    err.code = 'ENOENT';
    throw err;
  }

  const temDocker = await dockerDisponivel();
  if (!temDocker) {
    const err = new Error('Docker não está disponível neste servidor.');
    err.code = 'ENODOCKER';
    throw err;
  }

  const temImagem = await imagemDisponivel();
  if (!temImagem) {
    const err = new Error(
      `Imagem Docker ${DOCKER_IMAGE} não encontrada localmente. `
      + 'Rode: docker pull openai/whisper:latest'
    );
    err.code = 'ENOIMAGE';
    throw err;
  }

  const arquivoAbs = path.resolve(arquivo);
  const dirAbs = path.dirname(arquivoAbs);
  const nomeArquivo = path.basename(arquivoAbs);
  const containerFile = `/data/${nomeArquivo}`;

  const args = [
    'run', '--rm',
    '-v', `${dirAbs}:/data`,
    DOCKER_IMAGE,
    '--model', model,
    '--language', language,
    '--output_format', outputFormat,
    containerFile,
  ];

  try {
    const { stdout, stderr } = await execFileAsync('docker', args, {
      maxBuffer: 100 * 1024 * 1024, // 100 MB de buffer para logs do container
      timeout: 0, // sem timeout (transcrição pode demorar)
    });

    // O Whisper grava o output no mesmo diretório com a extensão do formato
    const baseNome = path.basename(arquivoAbs, path.extname(arquivoAbs));
    const outputFile = path.join(dirAbs, `${baseNome}.${outputFormat}`);

    return {
      outputFile,
      stdout,
      stderr,
    };
  } catch (err) {
    throw new Error(`Falha na transcrição Whisper: ${err.message}`);
  }
}

/**
 * Lista modelos disponíveis no Whisper.
 */
function listarModelos() {
  return ['tiny', 'base', 'small', 'medium', 'large-v3'];
}

module.exports = {
  transcrever,
  dockerDisponivel,
  imagemDisponivel,
  listarModelos,
  DOCKER_IMAGE,
  WHISPER_MEDIA_DIR,
};
