const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const { requireCustomerAuth } = require('../middleware/auth');

// GET /conta/login
router.get('/login', (req, res) => {
  if (req.session.customerId) return res.redirect('/conta');
  res.render('customer/login', { title: 'Entrar', error: null });
});

// POST /conta/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const customer = await Customer.findOne({ email: email.toLowerCase().trim() });

    if (!customer || !(await customer.checkPassword(password))) {
      return res.render('customer/login', {
        title: 'Entrar',
        error: 'E-mail ou senha inválidos.',
      });
    }

    if (!customer.active) {
      return res.render('customer/login', {
        title: 'Entrar',
        error: 'Conta desativada. Entre em contato com o suporte.',
      });
    }

    req.session.customerId = customer._id;
    req.session.customerName = customer.name;
    req.session.customerEmail = customer.email;

    const returnTo = req.session.returnTo || '/conta';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    res.render('customer/login', { title: 'Entrar', error: 'Erro ao fazer login.' });
  }
});

// GET /conta/cadastro
router.get('/cadastro', (req, res) => {
  if (req.session.customerId) return res.redirect('/conta');
  res.render('customer/register', { title: 'Criar conta', error: null });
});

// POST /conta/cadastro
router.post('/cadastro', async (req, res) => {
  try {
    const { name, email, password, passwordConfirm, phone } = req.body;

    if (!name || !email || !password) {
      return res.render('customer/register', {
        title: 'Criar conta',
        error: 'Preencha todos os campos obrigatórios.',
      });
    }

    if (password !== passwordConfirm) {
      return res.render('customer/register', {
        title: 'Criar conta',
        error: 'As senhas não coincidem.',
      });
    }

    if (password.length < 6) {
      return res.render('customer/register', {
        title: 'Criar conta',
        error: 'A senha deve ter pelo menos 6 caracteres.',
      });
    }

    const existing = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.render('customer/register', {
        title: 'Criar conta',
        error: 'Este e-mail já está cadastrado.',
      });
    }

    const customer = await Customer.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: await Customer.hashPassword(password),
      phone: phone || '',
    });

    req.session.customerId = customer._id;
    req.session.customerName = customer.name;
    req.session.customerEmail = customer.email;

    const returnTo = req.session.returnTo || '/conta';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    res.render('customer/register', {
      title: 'Criar conta',
      error: 'Erro ao criar conta: ' + err.message,
    });
  }
});

// POST /conta/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// GET /conta
router.get('/', requireCustomerAuth, async (req, res) => {
  const customer = await Customer.findById(req.session.customerId);
  if (!customer) {
    req.session.destroy(() => res.redirect('/conta/login'));
    return;
  }
  res.render('customer/profile', { title: 'Minha conta', customer });
});

// POST /conta/endereco
router.post('/endereco', requireCustomerAuth, async (req, res) => {
  try {
    const { label, street, number, complement, district, city, state, zipCode, addressId } = req.body;

    const customer = await Customer.findById(req.session.customerId);
    if (!customer) return res.redirect('/conta/login');

    if (addressId) {
      const addr = customer.addresses.id(addressId);
      if (addr) {
        addr.label = label || 'Principal';
        addr.street = street;
        addr.number = number;
        addr.complement = complement || '';
        addr.district = district || '';
        addr.city = city;
        addr.state = state;
        addr.zipCode = zipCode;
      }
    } else {
      if (req.body.setDefault === 'on') {
        customer.addresses.forEach((a) => (a.isDefault = false));
      }
      customer.addresses.push({
        label: label || 'Principal',
        street,
        number,
        complement: complement || '',
        district: district || '',
        city,
        state,
        zipCode,
        isDefault: customer.addresses.length === 0 || req.body.setDefault === 'on',
      });
    }

    await customer.save();
    res.redirect('/conta');
  } catch (err) {
    console.error(err);
    res.redirect('/conta');
  }
});

// POST /conta/endereco/:addressId/excluir
router.post('/endereco/:addressId/excluir', requireCustomerAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) return res.redirect('/conta/login');

    customer.addresses.pull(req.params.addressId);
    await customer.save();
    res.redirect('/conta');
  } catch (err) {
    console.error(err);
    res.redirect('/conta');
  }
});

module.exports = router;
