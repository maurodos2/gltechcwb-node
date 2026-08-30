/**
 * Armazenamento de imagens no Cloudflare R2 (compatível com a API S3 da AWS).
 * Endpoint derivado do ACCOUNT_ID: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 * Serve as imagens pela URL pública: R2_PUBLIC_BASE_URL/<key>
 */
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

let client = null;

function getClient() {
  if (client) return client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return client;
}

function getBucket() {
  return process.env.R2_BUCKET;
}

function getPublicBaseUrl() {
  return (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

function generateKey(originalname) {
  const ext = path.extname(originalname).toLowerCase() || '.jpg';
  const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
  return `produtos/${unique}${ext}`;
}

// Envia o buffer para o R2 e devolve a URL pública.
async function uploadImage(buffer, originalname, mimetype) {
  const key = generateKey(originalname);

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
  );

  const base = getPublicBaseUrl();
  if (!base) console.warn('[storage] R2_PUBLIC_BASE_URL não configurado; imagem enviada mas sem URL pública.');
  return base ? `${base}/${key}` : key;
}

// Apaga um objeto do R2. Recebe a URL pública ou o key.
async function deleteImage(urlOrKey) {
  const base = getPublicBaseUrl();
  const key = base && urlOrKey.startsWith(base) ? urlOrKey.slice(base.length + 1) : urlOrKey;

  if (!key || key.includes('..')) return;

  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
  );
}

module.exports = { uploadImage, deleteImage };