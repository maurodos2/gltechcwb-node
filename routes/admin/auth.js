const express = require('express');
const router = express.Router();
const Admin = require('../../models/Admin');

// GET /admin/login
router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { error: null, layout: false });
});

// POST /admin/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email: email.toLowerCase().trim(), active: true });

    if (!admin) {
      return res.render('admin/login', { error: 'E-mail ou senha inválidos.', layout: false });
    }

    const valid = await admin.checkPassword(password);
    if (!valid) {
      return res.render('admin/login', { error: 'E-mail ou senha inválidos.', layout: false });
    }

    // Regenera a sessão p/ evitar session fixation antes de autenticar
    req.session.regenerate((err) => {
      if (err) {
        return res.render('admin/login', {
          error: 'Erro ao iniciar a sessão. Tente novamente.',
          layout: false,
        });
      }
      req.session.adminId = admin._id.toString();
      req.session.adminName = admin.name;
      res.redirect('/admin');
    });
  } catch (err) {
    console.error(err);
    res.render('admin/login', { error: 'Erro ao tentar entrar. Tente novamente.', layout: false });
  }
});

// POST /admin/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

module.exports = router;
