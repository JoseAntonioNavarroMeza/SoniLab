const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sonilab_dev_secret_key_change_in_prod';

// Middleware para verificar la validez y expiración del token JWT
exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Acceso denegado: Cabecera Authorization requerida en formato Bearer <token>' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Inyectar datos del usuario decodificado en el objeto request
    req.user = decoded; 
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada. Por favor inicie sesión nuevamente.' });
    }
    return res.status(403).json({ error: 'Token inválido o manipulado.' });
  }
};

// Middleware para autorizar según uno o más roles permitidos
exports.requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Permisos insuficientes: Rol no identificado' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Acceso restringido: Se requiere uno de los roles [${allowedRoles.join(', ')}] para esta acción.` 
      });
    }

    next();
  };
};