const express = require('express');
const router = express.Router();
const loansController = require('../controllers/loans.controller');
const { verifyToken, requireRole } = require('../middlewares/auth.middleware');

// Rutas accesibles por usuarios autenticados
router.use(verifyToken);

router.get('/', loansController.getLoans);
router.get('/report', loansController.getClosedLoansReport);
router.post('/request', loansController.requestLoan);
router.put('/:id/return', loansController.initiateReturn);

// Rutas exclusivas para el Administrador / Encargado de taller
router.put('/:id/approve', requireRole('ADMIN'), loansController.approveLoan);
router.put('/:id/reject', requireRole('ADMIN'), loansController.rejectLoan);
router.post('/:id/close-inspection', requireRole('ADMIN'), loansController.closeLoanWithInspection);

module.exports = router;
