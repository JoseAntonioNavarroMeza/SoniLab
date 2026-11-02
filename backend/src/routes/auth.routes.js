const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');

// Rutas públicas
router.post('/register', authController.register);
router.post('/login', authController.login);

// Rutas protegidas de perfil
router.get('/me', verifyToken, authController.getProfile);
router.put('/profile', verifyToken, authController.updateUser);

// CRUD de Usuarios (Paginación, edición y baja lógica)
router.get('/users', verifyToken, requireRole('ADMIN'), authController.getUsers);
router.get('/', verifyToken, requireRole('ADMIN'), authController.getUsers);
router.post('/users', verifyToken, requireRole('ADMIN'), authController.register);
router.put('/users/:id', verifyToken, authController.updateUser);
router.put('/:id', verifyToken, authController.updateUser);
router.delete('/users/:id', verifyToken, requireRole('ADMIN'), authController.deleteUser);
router.delete('/:id', verifyToken, requireRole('ADMIN'), authController.deleteUser);

module.exports = router;
