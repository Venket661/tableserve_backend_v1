const express = require('express');
const { defaultRateLimiter } = require('../middleware/userRateLimit');
const { authenticate, authorize, checkFeatureAccess, checkResourceOwnership } = require('../middleware/authMiddleware');
const { ValidationRules, handleValidation } = require('../middleware/validationMiddleware');
const { createRouteHandler, routeErrorHandler, requestTimer } = require('../middleware/routeErrorHandler');
const {
  getAllRestaurants,
  getRestaurant,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  addTable,
  updateTable,
  removeTable,
  getRestaurantStats,
  toggleRestaurantStatus,
  getRestaurantBySlug,
  getRestaurantByIdPublic,
  updateRestaurantCredentials
} = require('../controllers/restaurantController');

const router = express.Router();

// Add request timing middleware
router.use(requestTimer);

// Use the standardized route handler
const wrapAsync = createRouteHandler;

// Apply rate limiting to all restaurant routes
router.use(defaultRateLimiter);

/**
 * Public Routes
 */

/**
 * @route GET /api/v1/restaurants/public/:slug
 * @desc Get restaurant by slug (public access for menu viewing)
 * @access Public
 */
router.get('/public/:slug',
  ValidationRules.validateObjectId('slug'),
  handleValidation,
  wrapAsync(getRestaurantBySlug, 'getRestaurantBySlug')
);

/**
 * @route GET /api/v1/restaurants/public/id/:id
 * @desc Get restaurant by ID (public access for checkout)
 * @access Public
 */
router.get('/public/id/:id',
  ValidationRules.validateObjectId('id'),
  handleValidation,
  wrapAsync(getRestaurantByIdPublic, 'getRestaurantByIdPublic')
);

/**
 * @route GET /api/v1/restaurants/:id
 * @desc Direct access to restaurant by ID (public access for QR code scanning)
 * @access Public
 */
router.get('/:id',
  ValidationRules.validateObjectId('id'),
  handleValidation,
  wrapAsync(getRestaurantByIdPublic, 'getRestaurantByIdPublic')
);

/**
 * Protected Routes - Require Authentication
 */

/**
 * @route GET /api/v1/restaurants
 * @desc Get all restaurants (admin) or user's restaurants
 * @access Private (admin, restaurant_owner)
 */
router.get('/',
  authenticate,
  authorize('admin', 'restaurant_owner'),
  ValidationRules.validatePagination,
  ValidationRules.validateSearch,
  ValidationRules.validateSorting,
  handleValidation,
  wrapAsync(getAllRestaurants, 'getAllRestaurants')
);

/**
 * @route POST /api/v1/restaurants
 * @desc Create new restaurant
 * @access Private (admin, restaurant_owner)
 */
router.post('/',
  authenticate,
  authorize('admin', 'restaurant_owner'),
  checkFeatureAccess('crudMenu'),
  ValidationRules.createRestaurant,
  handleValidation,
  wrapAsync(createRestaurant, 'createRestaurant')
);

/**
 * @route GET /api/v1/restaurants/:id
 * @desc Get single restaurant by ID
 * @access Private (admin, restaurant_owner - own restaurants only)
 */
router.get('/:id',
  authenticate,
  authorize('admin', 'restaurant_owner'),
  ValidationRules.validateObjectId('id'),
  handleValidation,
  wrapAsync(getRestaurant, 'getRestaurant')
);

/**
 * @route PUT /api/v1/restaurants/:id
 * @desc Update restaurant
 * @access Private (admin, restaurant_owner - own restaurants only)
 */
router.put('/:id',
  authenticate,
  authorize('admin', 'restaurant_owner'),
  checkFeatureAccess('crudMenu'),
  ValidationRules.validateObjectId('id'),
  ValidationRules.updateRestaurant,
  handleValidation,
  wrapAsync(updateRestaurant, 'updateRestaurant')
);

/**
 * @route DELETE /api/v1/restaurants/:id
 * @desc Delete restaurant (soft delete)
 * @access Private (admin, restaurant_owner - own restaurants only)
 */
router.delete('/:id',
  authenticate,
  authorize('admin', 'restaurant_owner'),
  ValidationRules.validateObjectId('id'),
  handleValidation,
  wrapAsync(deleteRestaurant, 'deleteRestaurant')
);

/**
 * @route PATCH /api/v1/restaurants/:id/toggle-status
 * @desc Toggle restaurant active status
 * @access Private (admin, restaurant_owner - own restaurants only)
 */
router.patch('/:id/toggle-status',
  authenticate,
  authorize('admin', 'restaurant_owner'),
  ValidationRules.validateObjectId('id'),
  handleValidation,
  wrapAsync(toggleRestaurantStatus, 'toggleRestaurantStatus')
);

/**
 * @route GET /api/v1/restaurants/:id/stats
 * @desc Get restaurant statistics
 * @access Private (admin, restaurant_owner - own restaurants only)
 */
router.get('/:id/stats',
  authenticate,
  authorize('admin', 'restaurant_owner'),
  checkFeatureAccess('analytics'),
  ValidationRules.validateObjectId('id'),
  handleValidation,
  wrapAsync(getRestaurantStats, 'getRestaurantStats')
);

/**
 * Table Management Routes
 */

/**
 * @route POST /api/v1/restaurants/:id/tables
 * @desc Add table to restaurant
 * @access Private (admin, restaurant_owner - own restaurants only)
 */
router.post('/:id/tables',
  authenticate,
  authorize('admin', 'restaurant_owner'),
  checkFeatureAccess('qrGeneration'),
  ValidationRules.validateObjectId('id'),
  handleValidation,
  wrapAsync(addTable, 'addTable')
);

/**
 * @route PUT /api/v1/restaurants/:id/tables/:tableId
 * @desc Update restaurant table
 * @access Private (admin, restaurant_owner - own restaurants only)
 */
router.put('/:id/tables/:tableId',
  authenticate,
  authorize('admin', 'restaurant_owner'),
  ValidationRules.validateObjectId('id'),
  ValidationRules.validateObjectId('tableId'),
  handleValidation,
  wrapAsync(updateTable, 'updateTable')
);

/**
 * @route DELETE /api/v1/restaurants/:id/tables/:tableId
 * @desc Remove table from restaurant
 * @access Private (admin, restaurant_owner - own restaurants only)
 */
router.delete('/:id/tables/:tableId',
  authenticate,
  authorize('admin', 'restaurant_owner'),
  ValidationRules.validateObjectId('id'),
  ValidationRules.validateObjectId('tableId'),
  handleValidation,
  wrapAsync(removeTable, 'removeTable')
);

/**
 * @route PUT /api/v1/restaurants/:id/credentials
 * @desc Update restaurant owner credentials
 * @access Private (admin only)
 */
router.put('/:id/credentials',
  authenticate,
  authorize('admin'),
  ValidationRules.validateObjectId('id'),
  handleValidation,
  wrapAsync(updateRestaurantCredentials, 'updateRestaurantCredentials')
);

// Apply the enhanced error handling middleware
router.use(routeErrorHandler);

module.exports = router;