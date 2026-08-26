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

// Protege rotas que exigem cliente autenticado (checkout, perfil, pedidos)
function requireCustomerAuth(req, res, next) {
  if (req.session && req.session.customerId) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  return res.redirect('/conta/login');
}

// Deixa o cliente logado disponível em todas as views públicas
function attachCustomerToLocals(req, res, next) {
  res.locals.currentCustomer = req.session.customerName || null;
  res.locals.customerId = req.session.customerId || null;
  next();
}

module.exports = {
  requireAdminAuth,
  attachAdminToLocals,
  requireCustomerAuth,
  attachCustomerToLocals,
};
