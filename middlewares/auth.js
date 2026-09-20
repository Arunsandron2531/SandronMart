function requireLogin(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.redirect('/login');
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.session || !req.session.userId) {
      return res.redirect('/login');
    }
    if (req.session.role === role) {
      return next();
    }
    return res.status(403).render('403', {
      title: 'Access Denied',
    });
  };
}

module.exports = {
  requireLogin,
  requireRole,
};