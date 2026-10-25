const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();
const Admin = require('../../models/Admin');
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});
const {
  createEnrollment,
  createEnrollmentUri,
  createRecoveryCodes,
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  verifyTotp,
} = require('../../lib/admin-two-factor');

const PENDING_SESSION_MS = 10 * 60 * 1000;
const AUTHENTICATED_SESSION_MS = 8 * 60 * 60 * 1000;

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

async function pendingAdmin(req) {
  if (!req.session.pendingAdminId) return null;
  return Admin.findOne({ _id: req.session.pendingAdminId, active: true }).select(
    '+twoFactorSecretEncrypted +twoFactorPendingSecretEncrypted +twoFactorRecoveryCodeHashes'
  );
}

async function beginPendingLogin(req, admin, step) {
  await regenerateSession(req);
  req.session.pendingAdminId = admin._id.toString();
  req.session.pendingAdminStep = step;
  req.session.cookie.maxAge = PENDING_SESSION_MS;
  await saveSession(req);
}

async function completeAdminLogin(req, res, admin) {
  await regenerateSession(req);
  req.session.adminId = admin._id.toString();
  req.session.adminName = admin.name;
  req.session.admin2faVerifiedAt = Date.now();
  req.session.cookie.maxAge = AUTHENTICATED_SESSION_MS;
  await saveSession(req);
  return res.redirect('/admin');
}

async function renderSetup(res, admin, error = null) {
  let secret;
  if (admin.twoFactorPendingSecretEncrypted) {
    secret = decryptSecret(admin.twoFactorPendingSecretEncrypted);
  } else {
    const enrollment = createEnrollment();
    secret = enrollment.secret;
    admin.twoFactorPendingSecretEncrypted = encryptSecret(secret);
    await admin.save();
  }
  const uri = createEnrollmentUri(admin.email, secret);
  const qrCode = await QRCode.toDataURL(uri, { width: 240, margin: 1 });
  res.render('admin/two-factor-setup', { qrCode, secret, error, layout: false });
}

function renderVerification(res, error = null) {
  return res.render('admin/two-factor-verify', { error, layout: false });
}

// GET /admin/login
router.get('/login', async (req, res) => {
  try {
    if (req.session.adminId && req.session.admin2faVerifiedAt) return res.redirect('/admin');
    if (req.session.pendingAdminId) {
      const path = req.session.pendingAdminStep === 'setup' ? '/admin/2fa/setup' : '/admin/2fa/verify';
      return res.redirect(path);
    }
    if (req.session.adminId) await regenerateSession(req);
    res.render('admin/login', { error: null, layout: false });
  } catch (err) {
    console.error(err);
    res.status(503).render('admin/login', {
      error: 'Não foi possível iniciar o login. Tente novamente.',
      layout: false,
    });
  }
});

// POST /admin/login
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const admin = await Admin.findOne({ email, active: true })
      .select('+twoFactorEnabled +twoFactorPendingSecretEncrypted');

    if (!admin) {
      return res.render('admin/login', { error: 'E-mail ou senha inválidos.', layout: false });
    }

    const valid = await admin.checkPassword(password);
    if (!valid) {
      return res.render('admin/login', { error: 'E-mail ou senha inválidos.', layout: false });
    }

    const step = admin.twoFactorEnabled ? 'verify' : 'setup';
    if (!admin.twoFactorEnabled && !admin.twoFactorPendingSecretEncrypted) {
      const enrollment = createEnrollment();
      admin.twoFactorPendingSecretEncrypted = encryptSecret(enrollment.secret);
      await admin.save();
    }
    await beginPendingLogin(req, admin, step);
    res.redirect(step === 'setup' ? '/admin/2fa/setup' : '/admin/2fa/verify');
  } catch (err) {
    console.error(err);
    const message = err.message.includes('ADMIN_2FA_ENCRYPTION_KEY')
      ? 'O segundo fator está sem a chave de proteção do servidor. Avise o responsável pelo sistema.'
      : 'Erro ao tentar entrar. Tente novamente.';
    res.render('admin/login', { error: message, layout: false });
  }
});

router.get('/2fa/setup', async (req, res) => {
  try {
    const admin = await pendingAdmin(req);
    if (!admin) return res.redirect('/admin/login');
    if (admin.twoFactorEnabled) return res.redirect('/admin/2fa/verify');
    await renderSetup(res, admin);
  } catch (err) {
    console.error(err);
    return res.status(503).render('admin/two-factor-setup', {
      qrCode: null,
      secret: null,
      error: 'Não foi possível iniciar a configuração. Verifique ADMIN_2FA_ENCRYPTION_KEY no ambiente.',
      layout: false,
    });
  }
});

router.post('/2fa/setup', async (req, res) => {
  try {
    const admin = await pendingAdmin(req);
    if (!admin) return res.redirect('/admin/login');
    if (admin.twoFactorEnabled) return res.redirect('/admin/2fa/verify');
    const secret = decryptSecret(admin.twoFactorPendingSecretEncrypted);
    if (!(await verifyTotp(secret, req.body.code))) {
      return renderSetup(res, admin, 'Código inválido. Confira o aplicativo e tente novamente.');
    }

    const recoveryCodes = createRecoveryCodes();
    req.session.setupRecoveryCodesEncrypted = encryptSecret(JSON.stringify(recoveryCodes));
    req.session.cookie.maxAge = PENDING_SESSION_MS;
    await saveSession(req);
    res.redirect('/admin/2fa/recovery');
  } catch (err) {
    console.error(err);
    return res.status(503).render('admin/two-factor-setup', {
      qrCode: null,
      secret: null,
      error: 'Não foi possível concluir a configuração. Entre novamente e tente outra vez.',
      layout: false,
    });
  }
});

router.get('/2fa/recovery', async (req, res) => {
  try {
    const admin = await pendingAdmin(req);
    if (!admin || !req.session.setupRecoveryCodesEncrypted) return res.redirect('/admin/login');
    const recoveryCodes = JSON.parse(decryptSecret(req.session.setupRecoveryCodesEncrypted));
    res.render('admin/two-factor-recovery', { recoveryCodes, error: null, layout: false });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/login');
  }
});

router.post('/2fa/recovery/confirm', async (req, res) => {
  try {
    const admin = await pendingAdmin(req);
    if (!admin || !req.session.setupRecoveryCodesEncrypted) return res.redirect('/admin/login');
    if (req.body.saved !== 'on') {
      const recoveryCodes = JSON.parse(decryptSecret(req.session.setupRecoveryCodesEncrypted));
      return res.status(400).render('admin/two-factor-recovery', {
        recoveryCodes,
        error: 'Confirme que guardou os códigos para continuar.',
        layout: false,
      });
    }

    const pendingSecret = admin.twoFactorPendingSecretEncrypted;
    const recoveryCodes = JSON.parse(decryptSecret(req.session.setupRecoveryCodesEncrypted));
    const result = await Admin.updateOne(
      {
        _id: admin._id,
        active: true,
        twoFactorEnabled: { $ne: true },
        twoFactorPendingSecretEncrypted: pendingSecret,
      },
      {
        $set: {
          twoFactorEnabled: true,
          twoFactorSecretEncrypted: pendingSecret,
          twoFactorPendingSecretEncrypted: '',
          twoFactorRecoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
        },
      }
    );
    if (result.modifiedCount !== 1) {
      req.session.destroy(() => res.redirect('/admin/login'));
      return;
    }
    await completeAdminLogin(req, res, admin);
  } catch (err) {
    console.error(err);
    res.redirect('/admin/login');
  }
});

router.get('/2fa/verify', async (req, res) => {
  try {
    const admin = await pendingAdmin(req);
    if (!admin) return res.redirect('/admin/login');
    if (req.session.setupRecoveryCodesEncrypted) return res.redirect('/admin/2fa/recovery');
    if (!admin.twoFactorEnabled) return res.redirect('/admin/2fa/setup');
    return renderVerification(res);
  } catch (err) {
    console.error(err);
    return renderVerification(res, 'Não foi possível carregar a verificação. Tente entrar novamente.');
  }
});

router.post('/2fa/verify', async (req, res) => {
  try {
    const admin = await pendingAdmin(req);
    if (!admin) return res.redirect('/admin/login');
    if (req.session.setupRecoveryCodesEncrypted) return res.redirect('/admin/2fa/recovery');
    if (!admin.twoFactorEnabled) return res.redirect('/admin/2fa/setup');

    const code = String(req.body.code || '').trim();
    let valid = await verifyTotp(decryptSecret(admin.twoFactorSecretEncrypted), code);

    if (!valid) {
      const recoveryHash = hashRecoveryCode(code);
      if (recoveryHash) {
        const result = await Admin.updateOne(
          { _id: admin._id, twoFactorRecoveryCodeHashes: recoveryHash },
          { $pull: { twoFactorRecoveryCodeHashes: recoveryHash } }
        );
        valid = result.modifiedCount === 1;
      }
    }

    if (!valid) return renderVerification(res, 'Código inválido ou já utilizado. Tente novamente.');
    await completeAdminLogin(req, res, admin);
  } catch (err) {
    console.error(err);
    renderVerification(res, 'Não foi possível validar o código. Tente novamente.');
  }
});

// POST /admin/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

module.exports = router;
