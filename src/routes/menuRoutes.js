const express = require('express');
const { param } = require('express-validator');
const { createRouteHandler, routeErrorHandler, requestTimer } = require('../middleware/routeErrorHandler');

// Safe imports with error handling
let MenuController, authenticate, authorize, defaultRateLimiter,
  validateResourceCreation, checkUsageLimit, ValidationRules,
  handleValidation, uploadMiddleware;

try {
  MenuController = require('../controllers/menuController');
  ({ authenticate, authorize } = require('../middleware/authMiddleware'));
  ({ defaultRateLimiter } = require('../middleware/userRateLimit'));
  ({ validateResourceCreation, checkUsageLimit } = require('../middleware/subscriptionMiddleware'));
  PlanValidationMiddleware = require('../middleware/planValidationMiddleware');
  ({ ValidationRules, handleValidation } = require('../middleware/validationMiddleware'));
  ({ uploadMiddleware } = require('../services/uploadService'));
} catch (error) {
  console.error('Error importing menu route dependencies:', error.message);
  // Create fallback middleware to prevent crashes
  const fallbackMiddleware = (req, res, next) => {
    res.status(503).json({
      success: false,
      error: { message: 'Service temporarily unavailable due to configuration error' }
    });
  };

  MenuController = MenuController || { getPublicMenu: fallbackMiddleware };
  authenticate = authenticate || fallbackMiddleware;
  authorize = authorize || (() => fallbackMiddleware);
  defaultRateLimiter = defaultRateLimiter || ((req, res, next) => next());
  validateResourceCreation = validateResourceCreation || (() => (req, res, next) => next());
  checkUsageLimit = checkUsageLimit || (() => (req, res, next) => next());
  ValidationRules = ValidationRules || {};
  handleValidation = handleValidation || ((req, res, next) => next());
  uploadMiddleware = uploadMiddleware || { single: () => (req, res, next) => next(), multiple: () => (req, res, next) => next() };
}

const router = express.Router();

// Helper function to safely spread validation rules
const safeSpread = (validationRules) => {
  if (!validationRules) return [];
  if (Array.isArray(validationRules)) return validationRules;
  return [validationRules];
};

// Helper function to safely get validation middleware
const getValidation = (validationMethod, ...args) => {
  try {
    if (ValidationRules && typeof ValidationRules[validationMethod] === 'function') {
      const result = ValidationRules[validationMethod](...args);
      return safeSpread(result);
    }
    if (ValidationRules && ValidationRules[validationMethod]) {
      return safeSpread(ValidationRules[validationMethod]);
    }
    return [];
  } catch (error) {
    console.warn(`Validation method ${validationMethod} failed:`, error.message);
    return [];
  }
};

// Apply rate limiting to all menu routes (with fallback)
if (defaultRateLimiter) {
  router.use(defaultRateLimiter);
}

// Validation middleware helper
const addValidationMiddleware = (router, method, path, middlewares, controllerMethod) => {
  try {
    // Validate the path pattern first
    if (!path || typeof path !== 'string') {
      console.error(`Invalid path for ${method.toUpperCase()} route:`, path);
      return;
    }

    // Check for common malformed patterns
    const pathValidation = /^[\/a-zA-Z0-9_\-.:()[\]\\*+?{}|\\^$]*$/.test(path);
    if (!pathValidation) {
      console.error(`Invalid characters in route path: ${path}`);
      return;
    }

    // Ensure all middlewares are functions
    const validMiddlewares = middlewares.filter(middleware => {
      if (typeof middleware === 'function') {
        return true;
      }
      console.warn('Skipping invalid middleware:', typeof middleware);
      return false;
    });

    // Add the route
    router[method](path, ...validMiddlewares, controllerMethod);
  } catch (error) {
    console.error(`Failed to add route ${method.toUpperCase()} ${path}:`, error.message);
  }
};

// 🟢 PUBLIC ROUTES FIRST (no authentication required)

// @route   GET /api/v1/menu/public/restaurant/:restaurantId
// @desc    Get complete menu structure for a specific restaurant
// @access  Public
router.get('/public/restaurant/:restaurantId',
  ...getValidation('validateObjectId', 'restaurantId'),
  handleValidation,
  (req, res, next) => {
    req.params.ownerType = 'restaurant';
    req.params.ownerId = req.params.restaurantId;
    next();
  },
  MenuController.getPublicMenu || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// @route   GET /api/v1/menu/public/:ownerType/:ownerId
// @desc    Get complete menu structure for public viewing
// @access  Public
router.get('/public/:ownerType/:ownerId',
  ...getValidation('validateObjectId', 'ownerId'),
  handleValidation,
  MenuController.getPublicMenu || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// @route   GET /api/v1/menu/public/:ownerType/:ownerId/items
// @desc    Get menu items with filtering (public for available items)
// @access  Public
router.get('/public/:ownerType/:ownerId/items',
  ...getValidation('validateObjectId', 'ownerId'),
  ...getValidation('validatePagination'),
  ...getValidation('validateSorting'),
  handleValidation,
  MenuController.getItems || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// @route   GET /api/v1/menu/public/:ownerType/:ownerId/categories
// @desc    Get categories for public viewing (customer-facing menu)
// @access  Public
router.get('/public/:ownerType/:ownerId/categories',
  ...getValidation('validateObjectId', 'ownerId'),
  handleValidation,
  MenuController.getCategories || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// @route   GET /api/v1/menu/public/:ownerType/:ownerId/modifiers
// @desc    Get modifiers for public viewing (customer-facing menu)
// @access  Public
router.get('/public/:ownerType/:ownerId/modifiers',
  ...getValidation('validateObjectId', 'ownerId'),
  handleValidation,
  MenuController.getPublicModifiers || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// @route   GET /api/v1/menu/public/shop/:shopId/modifiers
// @desc    Get shop modifiers for public viewing
// @access  Public
router.get('/public/shop/:shopId/modifiers',
  param('shopId').isMongoId().withMessage('Invalid shop ID format'),
  handleValidation,
  (req, res) => {
    // Convert shopId to ownerId and set ownerType
    req.params.ownerType = 'shop';
    req.params.ownerId = req.params.shopId;
    return MenuController.getPublicModifiers(req, res);
  }
);

// @route   GET /api/v1/menu/public/restaurant/:restaurantId/modifiers
// @desc    Get restaurant modifiers for public viewing
// @access  Public
router.get('/public/restaurant/:restaurantId/modifiers',
  param('restaurantId').isMongoId().withMessage('Invalid restaurant ID format'),
  handleValidation,
  (req, res) => {
    // Convert restaurantId to ownerId and set ownerType
    req.params.ownerType = 'restaurant';
    req.params.ownerId = req.params.restaurantId;
    return MenuController.getPublicModifiers(req, res);
  }
);

// @route   GET /api/v1/menu/public/restaurant/restaurant/:restaurantId/modifiers
// @desc    Get restaurant modifiers for public viewing (alternative URL format)
// @access  Public
router.get('/public/restaurant/restaurant/:restaurantId/modifiers',
  param('restaurantId').isMongoId().withMessage('Invalid restaurant ID format'),
  handleValidation,
  (req, res) => {
    // Convert restaurantId to ownerId and set ownerType
    req.params.ownerType = 'restaurant';
    req.params.ownerId = req.params.restaurantId;
    return MenuController.getPublicModifiers(req, res);
  }
);

// @route   GET /api/v1/menu/public/items/:itemId
// @desc    Get public menu item details
// @access  Public (no authentication required)
addValidationMiddleware(
  router,
  'get',
  '/public/items/:itemId',
  [
    ...getValidation('validateObjectId', 'itemId'),
    handleValidation
  ],
  MenuController.getPublicMenuItem || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// 🔒 PROTECTED ROUTES BELOW - Apply authentication middleware after all public routes

// Create a protected router for authenticated routes
const protectedRouter = express.Router();

// Apply authentication and authorization middleware to the protected router
protectedRouter.use((req, res, next) => {
  if (typeof authenticate === 'function') {
    return authenticate(req, res, (err) => {
      if (err) {
        return res.status(401).json({
          success: false,
          error: { message: 'Authentication required', code: 'AUTH_REQUIRED' }
        });
      }
      // If authentication succeeds, apply authorization
      if (typeof authorize === 'function') {
        return authorize('admin', 'restaurant_owner', 'zone_admin', 'zone_vendor', 'zone_shop')(req, res, next);
      }
      next();
    });
  }
  // If authentication is not available, return error
  return res.status(500).json({
    success: false,
    error: { message: 'Authentication service unavailable', code: 'AUTH_SERVICE_UNAVAILABLE' }
  });
});

// 2. SPECIFIC ADMIN ROUTES (with auth)
router.get('/shop/:shopId/categories',
  authenticate,
  authorize(['zone_shop', 'zone_vendor', 'zone_admin']),
  param('shopId').isMongoId().withMessage('Invalid shop ID'),
  handleValidation,
  (req, res) => {
    req.params.ownerType = 'shop';
    req.params.ownerId = req.params.shopId;
    return MenuController.getCategories(req, res);
  }
);

router.post('/shop/:shopId/categories',
  authenticate,
  authorize(['zone_shop', 'zone_vendor', 'zone_admin']),
  param('shopId').isMongoId().withMessage('Invalid shop ID'),
  ...getValidation('createMenuCategory'),
  handleValidation,
  (req, res) => {
    req.params.ownerType = 'shop';
    req.params.ownerId = req.params.shopId;
    return MenuController.createCategory(req, res);
  }
);

router.get('/shop/:shopId/items',
  authenticate,
  authorize(['zone_shop', 'zone_vendor', 'zone_admin']),
  param('shopId').isMongoId().withMessage('Invalid shop ID'),
  handleValidation,
  (req, res) => {
    req.params.ownerType = 'shop';
    req.params.ownerId = req.params.shopId;
    return MenuController.getItems(req, res);
  }
);

router.post('/shop/:shopId/items',
  authenticate,
  authorize(['zone_shop', 'zone_vendor', 'zone_admin']),
  param('shopId').isMongoId().withMessage('Invalid shop ID'),
  uploadMiddleware ? uploadMiddleware.single('image') : (req, res, next) => next(),
  ...getValidation('createMenuItem'),
  handleValidation,
  (req, res) => {
    req.params.ownerType = 'shop';
    req.params.ownerId = req.params.shopId;
    return MenuController.createItem(req, res);
  }
);

// Add similar patterns for restaurant-specific routes
router.get('/restaurant/:restaurantId/categories',
  authenticate,
  authorize(['restaurant_owner', 'admin']),
  param('restaurantId').isMongoId().withMessage('Invalid restaurant ID'),
  handleValidation,
  (req, res) => {
    req.params.ownerType = 'restaurant';
    req.params.ownerId = req.params.restaurantId;
    return MenuController.getCategories(req, res);
  }
);

router.post('/restaurant/:restaurantId/categories',
  authenticate,
  authorize(['restaurant_owner', 'admin']),
  param('restaurantId').isMongoId().withMessage('Invalid restaurant ID'),
  ...getValidation('createMenuCategory'),
  handleValidation,
  (req, res) => {
    req.params.ownerType = 'restaurant';
    req.params.ownerId = req.params.restaurantId;
    return MenuController.createCategory(req, res);
  }
);

router.get('/debug/shop-routes/:shopId', (req, res) => {
  res.json({
    message: 'Shop routes working',
    shopId: req.params.shopId,
    availableEndpoints: [
      `GET /menu/shop/${req.params.shopId}/categories`,
      `POST /menu/shop/${req.params.shopId}/categories`,
      `GET /menu/shop/${req.params.shopId}/items`,
      `POST /menu/shop/${req.params.shopId}/items`,
      `GET /menu/shop/${req.params.shopId}/modifiers`,
      `POST /menu/shop/${req.params.shopId}/modifiers`
    ]
  });
});

// Mount the protected router under the main router AFTER defining all public routes
router.use(protectedRouter);

// Category Management Routes
addValidationMiddleware(
  protectedRouter,
  'get',
  '/:ownerType/:ownerId/categories',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validatePagination'),
    ...getValidation('validateSearch'),
    handleValidation
  ],
  MenuController.getCategories || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'post',
  '/:ownerType/:ownerId/categories',
  [
    PlanValidationMiddleware ? PlanValidationMiddleware.checkCategoryCreationLimit() : (req, res, next) => next(),
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('createMenuCategory'),
    handleValidation
  ],
  MenuController.createCategory || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'put',
  '/:ownerType/:ownerId/categories/:categoryId',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'categoryId'),
    ...getValidation('updateMenuCategory'),
    handleValidation
  ],
  MenuController.updateCategory || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'delete',
  '/:ownerType/:ownerId/categories/:categoryId',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'categoryId'),
    handleValidation
  ],
  MenuController.deleteCategory || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// Menu Item Management Routes
addValidationMiddleware(
  protectedRouter,
  'get',
  '/:ownerType/:ownerId/items',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validatePagination'),
    handleValidation
  ],
  MenuController.getItems || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'get',
  '/:ownerType/:ownerId/items/:itemId',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'itemId'),
    handleValidation
  ],
  MenuController.getItem || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'post',
  '/:ownerType/:ownerId/items',
  [
    PlanValidationMiddleware ? PlanValidationMiddleware.checkMenuItemCreationLimit() : (req, res, next) => next(),
    uploadMiddleware ? uploadMiddleware.single('image') : (req, res, next) => next(),
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('createMenuItem'),
    handleValidation
  ],
  MenuController.createItem || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'put',
  '/:ownerType/:ownerId/items/:itemId',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'itemId'),
    uploadMiddleware ? uploadMiddleware.single('image') : (req, res, next) => next(),
    ...getValidation('updateMenuItem'),
    handleValidation
  ],
  MenuController.updateItem || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'delete',
  '/:ownerType/:ownerId/items/:itemId',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'itemId'),
    handleValidation
  ],
  MenuController.deleteItem || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// Item Status Management
addValidationMiddleware(
  protectedRouter,
  'patch',
  '/:ownerType/:ownerId/items/:itemId/status',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'itemId'),
    handleValidation
  ],
  MenuController.toggleItemStatus || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// Image Management Routes
addValidationMiddleware(
  protectedRouter,
  'post',
  '/:ownerType/:ownerId/items/:itemId/images',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'itemId'),
    uploadMiddleware ? uploadMiddleware.multiple('images', 5) : (req, res, next) => next(),
    handleValidation
  ],
  MenuController.uploadItemImages || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'delete',
  '/:ownerType/:ownerId/items/:itemId/images/:imageId',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'itemId'),
    ...getValidation('validateObjectId', 'imageId'),
    handleValidation
  ],
  MenuController.deleteItemImage || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'post',
  '/:ownerType/:ownerId/items/:itemId/upload',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'itemId'),
    uploadMiddleware ? uploadMiddleware.multiple('images', 5) : (req, res, next) => next(),
    handleValidation,
    checkUsageLimit ? checkUsageLimit('maxImageUploads') : (req, res, next) => next()
  ],
  MenuController.uploadItemImages || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// Modifier Management Routes
addValidationMiddleware(
  protectedRouter,
  'get',
  '/:ownerType/:ownerId/modifiers',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validatePagination'),
    handleValidation
  ],
  MenuController.getModifiers || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'post',
  '/:ownerType/:ownerId/modifiers',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('createModifier'),
    handleValidation
  ],
  MenuController.createModifier || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'put',
  '/:ownerType/:ownerId/modifiers/:modifierId',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'modifierId'),
    ...getValidation('updateModifier'),
    handleValidation
  ],
  MenuController.updateModifier || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'delete',
  '/:ownerType/:ownerId/modifiers/:modifierId',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateObjectId', 'modifierId'),
    handleValidation
  ],
  MenuController.deleteModifier || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// Menu Structure Management
addValidationMiddleware(
  protectedRouter,
  'get',
  '/:ownerType/:ownerId/structure',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    handleValidation
  ],
  MenuController.getMenuStructure || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

addValidationMiddleware(
  protectedRouter,
  'put',
  '/:ownerType/:ownerId/structure',
  [
    ...getValidation('validateObjectId', 'ownerId'),
    ...getValidation('validateMenuStructure'),
    handleValidation
  ],
  MenuController.updateMenuStructure || ((req, res) => res.status(501).json({ success: false, error: { message: 'Controller method not implemented' } }))
);

// Zone Shop specific routes for modifiers
addValidationMiddleware(
  protectedRouter,
  'get',
  '/shop/:shopId/modifiers',
  [
    param('shopId').isMongoId().withMessage('Invalid shop ID format'),
    ...getValidation('validatePagination'),
    handleValidation
  ],
  (req, res) => {
    // Convert shopId to ownerId and set ownerType
    req.params.ownerType = 'shop';
    req.params.ownerId = req.params.shopId;
    return MenuController.getModifiers(req, res);
  }
);

addValidationMiddleware(
  protectedRouter,
  'post',
  '/shop/:shopId/modifiers',
  [
    param('shopId').isMongoId().withMessage('Invalid shop ID format'),
    ...getValidation('createModifier'),
    handleValidation
  ],
  (req, res) => {
    // Convert shopId to ownerId and set ownerType
    req.params.ownerType = 'shop';
    req.params.ownerId = req.params.shopId;
    return MenuController.createModifier(req, res);
  }
);

addValidationMiddleware(
  protectedRouter,
  'put',
  '/shop/:shopId/modifiers/:modifierId',
  [
    param('shopId').isMongoId().withMessage('Invalid shop ID format'),
    param('modifierId').isMongoId().withMessage('Invalid modifier ID format'),
    ...getValidation('updateModifier'),
    handleValidation
  ],
  (req, res) => {
    // Convert shopId to ownerId and set ownerType
    req.params.ownerType = 'shop';
    req.params.ownerId = req.params.shopId;
    return MenuController.updateModifier(req, res);
  }
);

addValidationMiddleware(
  protectedRouter,
  'delete',
  '/shop/:shopId/modifiers/:modifierId',
  [
    param('shopId').isMongoId().withMessage('Invalid shop ID format'),
    param('modifierId').isMongoId().withMessage('Invalid modifier ID format'),
    handleValidation
  ],
  (req, res) => {
    // Convert shopId to ownerId and set ownerType
    req.params.ownerType = 'shop';
    req.params.ownerId = req.params.shopId;
    return MenuController.deleteModifier(req, res);
  }
);

// Add a simple test route to verify the router is working
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Menu routes are working',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /public/:ownerType/:ownerId',
      'GET /public/items/:itemId',
      'GET /:ownerType/:ownerId/categories',
      'POST /:ownerType/:ownerId/categories',
      'PUT /:ownerType/:ownerId/categories/:categoryId',
      'DELETE /:ownerType/:ownerId/categories/:categoryId',
      'GET /:ownerType/:ownerId/items',
      'GET /:ownerType/:ownerId/items/:itemId',
      'POST /:ownerType/:ownerId/items',
      'PUT /:ownerType/:ownerId/items/:itemId',
      'DELETE /:ownerType/:ownerId/items/:itemId',
      'PATCH /:ownerType/:ownerId/items/:itemId/status',
      'POST /:ownerType/:ownerId/items/:itemId/images',
      'DELETE /:ownerType/:ownerId/items/:itemId/images/:imageId',
      'POST /:ownerType/:ownerId/items/:itemId/upload',
      'GET /:ownerType/:ownerId/structure',
      'PUT /:ownerType/:ownerId/structure'
    ]
  });
});

// Apply the enhanced error handling middleware
router.use(routeErrorHandler);

module.exports = router;
