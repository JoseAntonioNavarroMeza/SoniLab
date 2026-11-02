const express = require('express');
const router = express.Router();
const inspectionsController = require('../controllers/inspections.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

router.use(verifyToken);

// Habilitar la raíz '/' y '/recent' para que el frontend obtenga la lista
router.get('/', inspectionsController.getRecentInspections);
router.get('/recent', inspectionsController.getRecentInspections);
router.get('/loan/:loanId', inspectionsController.getInspectionByLoanId);

module.exports = router;
