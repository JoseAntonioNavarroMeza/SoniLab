const express = require('express');
const router = express.Router();
const instrumentsController = require('../controllers/instruments.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');

// Rutas públicas o de lectura general (alumnos autenticados o visitantes)
// Pueden usar verifyToken opcionalmente para detectar el rol del usuario si envía cabecera
router.get('/', (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    return verifyToken(req, res, next);
  }
  next();
}, instrumentsController.getInstruments);

router.get('/:id', instrumentsController.getInstrumentById);

// Rutas de administración de inventario (Exclusivas para ADMIN)
router.post('/', verifyToken, requireRole('ADMIN'), instrumentsController.createInstrument);
router.put('/:id', verifyToken, requireRole('ADMIN'), instrumentsController.updateInstrument);
router.delete('/:id', verifyToken, requireRole('ADMIN'), instrumentsController.deleteInstrument);

module.exports = router;