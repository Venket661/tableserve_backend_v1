const Razorpay = require('razorpay');
const { Order, Restaurant } = require('../models');
const catchAsync = require('../utils/catchAsync');
const { APIError } = require('../utils/apiError');
const { logger } = require('../utils/logger');
const orderPaymentService = require('../services/orderPaymentService');

// Log environment variables for debugging
logger.info('Checking Razorpay environment variables:', {
  hasKeyId: !!process.env.RAZORPAY_KEY_ID,
  hasKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
  keyIdLength: process.env.RAZORPAY_KEY_ID?.length || 0,
  keySecretLength: process.env.RAZORPAY_KEY_SECRET?.length || 0
});

// Initialize Razorpay instance for UPI payments
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  try {
    logger.info('Initializing Razorpay with keys:', {
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret_length: process.env.RAZORPAY_KEY_SECRET?.length || 0
    });
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    logger.info('UPI Payment Controller: Razorpay initialized successfully');
  } catch (error) {
    logger.error('UPI Payment Controller: Razorpay initialization failed', error);
  }
} else {
  logger.warn('UPI Payment Controller: Razorpay keys missing - payment functionality disabled', {
    hasKeyId: !!process.env.RAZORPAY_KEY_ID,
    hasKeySecret: !!process.env.RAZORPAY_KEY_SECRET
  });
}

/**
 * Create UPI order for payment
 * @route POST /upi-payments/create-order
 * @access Public
 */
const createUpiOrder = catchAsync(async (req, res) => {
  const { amount, restaurant_id, customer_id, payment_method } = req.body;

  // Log incoming request
  logger.info('UPI Payment Controller: Incoming request to createUpiOrder', {
    body: req.body,
    headers: req.headers
  });

  // Validate required fields
  if (!amount || !restaurant_id || !customer_id || !payment_method) {
    logger.warn('UPI Payment Controller: Missing required fields', {
      amount: !!amount,
      restaurant_id: !!restaurant_id,
      customer_id: !!customer_id,
      payment_method: !!payment_method
    });
    throw new APIError('amount, restaurant_id, customer_id, and payment_method are required', 400);
  }

  // Validate payment method
  if (payment_method !== 'upi') {
    logger.warn('UPI Payment Controller: Invalid payment method', { payment_method });
    throw new APIError('Invalid payment method. Only UPI is supported.', 400);
  }

  try {
    // Log request data for debugging
    logger.info('UPI Payment Controller: createUpiOrder called with:', { amount, restaurant_id, customer_id, payment_method });
    
    // Check if Razorpay is initialized
    if (!razorpay) {
      logger.error('UPI Payment Controller: Razorpay not initialized');
      throw new APIError('Payment service not available', 500);
    }
    
    // Find restaurant to get UPI ID
    const restaurant = await Restaurant.findById(restaurant_id);
    if (!restaurant) {
      logger.warn('UPI Payment Controller: Restaurant not found', { restaurant_id });
      throw new APIError('Restaurant not found', 404);
    }

    if (!restaurant.paymentConfig || !restaurant.paymentConfig.upiId) {
      logger.warn('UPI Payment Controller: Restaurant UPI ID not configured', { 
        restaurantId: restaurant_id,
        hasPaymentConfig: !!restaurant.paymentConfig,
        hasUpiId: !!(restaurant.paymentConfig && restaurant.paymentConfig.upiId)
      });
      throw new APIError('Restaurant UPI ID not configured', 400);
    }

    // Create Razorpay order
    logger.info('Creating Razorpay order with amount:', amount * 100);
    let order;
    try {
      order = await razorpay.orders.create({
        amount: amount * 100, // convert to paise
        currency: "INR",
        payment_capture: 1,
        notes: {
          restaurant_id,
          customer_id,
          payment_method: 'upi'
        },
      });
      logger.info('Razorpay order created successfully:', order.id);
    } catch (razorpayError) {
      logger.error('Failed to create Razorpay order:', {
        error: razorpayError.message,
        stack: razorpayError.stack,
        restaurant_id,
        amount
      });
      throw new APIError(`Failed to create payment order: ${razorpayError.message}`, 500);
    }

    logger.info('UPI order created', {
      orderId: order.id,
      amount: amount,
      restaurantId: restaurant_id,
      customerId: customer_id
    });

    // Send JSON response
    const responseData = {
      success: true,
      order_id: order.id,
      amount: amount,
      restaurant_upi: restaurant.paymentConfig.upiId
    };
    
    logger.info('UPI Payment Controller: Sending response', responseData);
    res.status(201).json(responseData);

  } catch (error) {
    logger.error('Failed to create UPI order', {
      error: error.message,
      stack: error.stack,
      restaurantId: restaurant_id,
      customerId: customer_id
    });
    // If it's already an APIError, rethrow it
    if (error instanceof APIError) {
      // Send JSON error response
      return res.status(error.statusCode).json({
        success: false,
        error: {
          message: error.message,
          statusCode: error.statusCode
        }
      });
    }
    // Otherwise, create a new APIError
    const apiError = new APIError(`Failed to create UPI order: ${error.message}`, 500);
    res.status(apiError.statusCode).json({
      success: false,
      error: {
        message: apiError.message,
        statusCode: apiError.statusCode
      }
    });
  }
});

/**
 * Handle UPI payment webhook
 * @route POST /upi-payments/webhook
 * @access Public
 */
const handleUpiWebhook = catchAsync(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const webhookData = req.body;

  if (!signature) {
    throw new APIError('Webhook signature missing', 400);
  }

  try {
    // Process webhook through order payment service
    const result = await orderPaymentService.handleWebhook(webhookData, signature);

    logger.info('UPI payment webhook processed', {
      event: webhookData.event,
      success: result.success,
      message: result.message
    });

    // If payment was captured, trigger instant payout to restaurant
    if (webhookData.event === 'payment.captured') {
      await triggerInstantPayout(webhookData.payload.payment.entity);
    }

    res.status(200).json({
      success: true,
      message: result.message
    });

  } catch (error) {
    logger.error('Failed to process UPI payment webhook', {
      event: webhookData.event,
      error: error.message
    });
    throw error;
  }
});

/**
 * Trigger instant payout to restaurant
 * @param {Object} paymentEntity - Razorpay payment entity
 */
async function triggerInstantPayout(paymentEntity) {
  try {
    const { order_id: razorpayOrderId } = paymentEntity;

    // Find order by Razorpay order ID
    const order = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId })
      .populate('restaurantId', 'name paymentConfig');

    if (!order) {
      logger.warn('Order not found for payout', { razorpayOrderId });
      return;
    }

    // Check if restaurant has payout configuration
    const restaurant = order.restaurantId;
    if (!restaurant || !restaurant.paymentConfig || !restaurant.paymentConfig.upiId) {
      logger.warn('Restaurant payout configuration missing', { 
        restaurantId: restaurant?._id,
        hasPaymentConfig: !!restaurant?.paymentConfig
      });
      return;
    }

    // Skip payout if RazorpayX credentials are not configured
    if (!process.env.RAZORPAYX_KEY_ID || !process.env.RAZORPAYX_KEY_SECRET) {
      logger.warn('RazorpayX credentials not configured - skipping payout', {
        orderId: order._id,
        restaurantId: restaurant._id
      });
      return;
    }

    // Initialize RazorpayX instance
    const razorpayX = new Razorpay({
      key_id: process.env.RAZORPAYX_KEY_ID,
      key_secret: process.env.RAZORPAYX_KEY_SECRET,
    });

    // Create payout
    const payout = await razorpayX.payouts.create({
      account_number: process.env.RAZORPAYX_ACCOUNT || 'default',
      fund_account_id: null, // We'll use UPI directly
      amount: order.pricing.total * 100, // Convert to paise
      currency: "INR",
      mode: "UPI",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: order.orderNumber,
      narration: `Payout for order ${order.orderNumber}`,
      notes: {
        order_id: order._id.toString(),
        restaurant_id: restaurant._id.toString(),
        order_number: order.orderNumber
      },
      to: {
        contact: {
          name: restaurant.name,
          email: restaurant.contact?.email || '',
          contact: restaurant.contact?.phone || '',
        },
        account_number: null,
        fund_account_id: null,
        vpa: {
          address: restaurant.paymentConfig.upiId
        }
      }
    });

    logger.info('Instant payout triggered', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      payoutId: payout.id,
      amount: order.pricing.total,
      restaurantId: restaurant._id,
      restaurantUpiId: restaurant.paymentConfig.upiId
    });

    return payout;

  } catch (error) {
    logger.error('Failed to trigger instant payout', {
      error: error.message,
      stack: error.stack
    });
    // Don't throw error as this shouldn't fail the payment webhook
  }
}

/**
 * Check order status
 * @route GET /upi-payments/check-order-status
 * @access Public
 */
const checkOrderStatus = catchAsync(async (req, res) => {
  const { order_id } = req.query;

  if (!order_id) {
    throw new APIError('order_id is required', 400);
  }

  try {
    // Find order by Razorpay order ID
    const order = await Order.findOne({ 'payment.razorpayOrderId': order_id });

    if (!order) {
      throw new APIError('Order not found', 404);
    }

    res.status(200).json({
      success: true,
      order_id: order_id,
      status: order.payment.status,
      order_status: order.status
    });

  } catch (error) {
    logger.error('Failed to check order status', {
      orderId: order_id,
      error: error.message
    });
    throw error;
  }
});

module.exports = {
  createUpiOrder,
  handleUpiWebhook,
  checkOrderStatus
};