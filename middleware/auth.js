// Protege rotas do painel admin: exige sessão de admin autenticado.
function requireAdminAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.redirect('/admin/login');
}

// Deixa o admin logado disponível em todas as views (para exibir nome, etc.)
function attachAdminToLocals(req, res, next) {
  res.locals.currentAdmin = req.session.adminName || null;
  next();
}

module.exports = { requireAdminAuth, attachAdminToLocals };
