const crypto = require('crypto');
const {
  generateSecret,
  generateURI,
  verify,
} = require('otplib');

function encryptionKey() {
  const value = process.env.ADMIN_2FA_ENCRYPTION_KEY || '';
  if (value.length < 32) {
    throw new Error('ADMIN_2FA_ENCRYPTION_KEY deve ter ao menos 32 caracteres aleatórios.');
  }

  const key = /^[a-f0-9]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');

  return key.length === 32 ? key : crypto.createHash('sha256').update(value, 'utf8').digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(value) {
  const [ivText, tagText, encryptedText] = String(value || '').split('.');
  if (!ivText || !tagText || !encryptedText) throw new Error('Segredo 2FA armazenado em formato inválido.');

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function createEnrollment() {
  const secret = generateSecret();
  return {
    secret,
    uri: createEnrollmentUri('Admin', secret),
  };
}

function createEnrollmentUri(label, secret) {
  return generateURI({ issuer: 'GLTechCWB', label, secret });
}

async function verifyTotp(secret, token) {
  const normalized = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const result = await verify({ secret, token: normalized, epochTolerance: 30 });
  return result.valid;
}

function createRecoveryCodes() {
  return Array.from({ length: 10 }, () => crypto.randomBytes(12).toString('hex').toUpperCase());
}

function hashRecoveryCode(code) {
  const normalized = String(code || '').replace(/[^a-f0-9]/gi, '').toUpperCase();
  if (!/^[A-F0-9]{24}$/.test(normalized)) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

module.exports = {
  createEnrollment,
  createEnrollmentUri,
  createRecoveryCodes,
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  verifyTotp,
};