const express = require('express');
const { body, query } = require('express-validator');
const { createUpiOrder, handleUpiWebhook, checkOrderStatus } = require('../controllers/upiPaymentController');
const { validateWebhookSignature, logPaymentSecurityEvents } = require('../middleware/paymentSecurity');
const { handleValidation } = require('../middleware/validationMiddleware');

const router = express.Router();

// Add a simple test route to verify the router is working
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'UPI payment routes are working' });
});

// Test route without validation
router.post('/test-create-order', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Test endpoint working',
    order_id: 'test_order_id_123',
    amount: req.body.amount || 100,
    restaurant_upi: 'test@upi'
  });
});

/**
 * @route POST /upi-payments/create-order
 * @desc Create UPI order for payment
 * @access Public
 */
router.post('/create-order',
  [
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('restaurant_id').isMongoId().withMessage('Invalid restaurant ID'),
    body('customer_id').isMongoId().withMessage('Invalid customer ID'),
    body('payment_method').equals('upi').withMessage('Payment method must be "upi"'),
    handleValidation
  ],
  createUpiOrder
);

/**
 * @route POST /upi-payments/webhook
 * @desc Handle UPI payment webhook
 * @access Public
 */
router.post('/webhook',
  logPaymentSecurityEvents,
  validateWebhookSignature,
  handleUpiWebhook
);

/**
 * @route GET /upi-payments/check-order-status
 * @desc Check order payment status
 * @access Public
 */
router.get('/check-order-status',
  [
    query('order_id').notEmpty().withMessage('Order ID is required'),
    handleValidation
  ],
  checkOrderStatus
);

module.exports = router;