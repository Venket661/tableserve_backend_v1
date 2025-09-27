// Enhanced server.js with improved error handling and route loading

// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Enhanced logging utility with fallback
const createLogger = () => {
  try {
    const { logger } = require('./src/utils/logger');
    return logger;
  } catch (error) {
    console.warn('Logger not available, using console fallback');
    return {
      info: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] INFO:`, message, ...args);
      },
      warn: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.warn(`[${timestamp}] WARN:`, message, ...args);
      },
      error: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ERROR:`, message, ...args);
      },
      debug: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.debug(`[${timestamp}] DEBUG:`, message, ...args);
      }
    };
  }
};

const logger = createLogger();

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        process.env.ADMIN_PANEL_URL,
        'https://tableserves.com'
      ].filter(Boolean);
      
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    } else {
      // Development - more permissive
      const devOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'http://localhost:8080',
        'http://localhost:4173',
        'https://tableserves.com'
      ];
      
      if (!origin || devOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      logger.warn(`CORS: Unknown origin in development: ${origin}`);
      return callback(null, true); // Allow in development
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ]
};

// Basic middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Security middleware
if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
  app.use(compression());
  
  // Production rate limiting
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: { message: 'Too many requests, please try again later.' }
    }
  }));
} else {
  // Development - basic security
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  
  // Lenient rate limiting for development
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000, // Very high limit for development
    skip: (req) => req.path.includes('/health') || req.path.includes('/test')
  }));
}

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request ID middleware
app.use((req, res, next) => {
  req.id = Math.random().toString(36).substr(2, 9);
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: {
      write: message => logger.info(message.trim())
    },
    skip: (req) => req.url.includes('/health') || req.url.includes('/socket.io')
  }));
}

// Health check endpoints
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    // Check database if available
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().ping();
        health.database = 'connected';
      } else {
        health.database = 'disconnected';
        health.status = 'degraded';
      }
    } catch (dbError) {
      health.database = 'error';
      health.status = 'degraded';
    }

    res.json({
      success: true,
      message: 'TableServe Backend API is running',
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      status: 'unhealthy'
    });
  }
});

app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'TableServe API is working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Enhanced file existence checker
const checkRouteFileExists = (routePath) => {
  try {
    const fullPath = require.resolve(routePath);
    return fs.existsSync(fullPath);
  } catch (error) {
    return false;
  }
};

// Enhanced route validation
const validateRouter = (router, routeName) => {
  if (!router) {
    return { valid: false, error: 'Router is null or undefined' };
  }

  if (typeof router !== 'function') {
    return { valid: false, error: 'Router is not a function' };
  }

  if (!router.stack || !Array.isArray(router.stack)) {
    return { valid: false, error: 'Router has no valid stack' };
  }

  // Enhanced route pattern validation
  try {
    for (const layer of router.stack) {
      if (layer.route && layer.route.path) {
        const path = layer.route.path;
        
        // Check for common path-to-regexp issues
        if (path.endsWith(':')) {
          return { valid: false, error: `Invalid route path ends with colon: ${path}`, path };
        }
        
        if (path.includes(':/')) {
          return { valid: false, error: `Invalid parameter syntax in path: ${path}`, path };
        }
        
        if (path.includes('()') || path.includes('[]')) {
          return { valid: false, error: `Empty groups/brackets in path: ${path}`, path };
        }

        // Check for malformed parameters
        const paramMatches = path.match(/:([^\/\?\#\s]*)/g);
        if (paramMatches) {
          for (const param of paramMatches) {
            const paramName = param.substring(1);
            if (!paramName || paramName.length === 0) {
              return { valid: false, error: `Empty parameter name in path: ${path}`, path };
            }
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(paramName)) {
              return { valid: false, error: `Invalid parameter name "${paramName}" in path: ${path}`, path };
            }
          }
        }
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Validation error: ${error.message}` };
  }
};

// Enhanced route loader with better error handling
const loadRoute = (routeConfig) => {
  const { name, path: routePath } = routeConfig;
  
  logger.info(`[ROUTE] Loading ${name} from ${routePath}`);
  
  try {
    // Check if file exists first
    if (!checkRouteFileExists(routePath)) {
      logger.warn(`[ROUTE] File not found: ${routePath} - Skipping ${name} route`);
      return null;
    }

    // Clear cache for fresh load
    const fullPath = require.resolve(routePath);
    delete require.cache[fullPath];

    // Load the module
    const router = require(routePath);
    
    if (!router) {
      logger.error(`[ROUTE] Module ${name} returned null/undefined`);
      return null;
    }

    // Validate the router
    const validation = validateRouter(router, name);
    if (!validation.valid) {
      logger.error(`[ROUTE] Validation failed for ${name}: ${validation.error}`);
      if (validation.path) {
        logger.error(`[ROUTE] Problematic path in ${name}: ${validation.path}`);
      }
      return null;
    }

    logger.info(`[ROUTE] Successfully loaded ${name}`);
    return router;

  } catch (error) {
    logger.error(`[ROUTE] Failed to load ${name}: ${error.message}`);
    
    // Provide specific guidance for common errors
    if (error.message.includes('Missing parameter name')) {
      logger.error(`[ROUTE] Path-to-regexp error in ${name} - check for malformed route parameters`);
    } else if (error.code === 'MODULE_NOT_FOUND') {
      logger.warn(`[ROUTE] Module not found: ${routePath} - This route will be skipped`);
    }
    
    return null;
  }
};

// Route configuration with conditional loading
const routeConfigs = [
  { name: 'auth', path: './src/routes/authRoutes', mount: '/auth', required: true },
  { name: 'business-setup', path: './src/routes/businessSetupRoutes', mount: '/business-setup', required: false },
  { name: 'restaurants', path: './src/routes/restaurantRoutes', mount: '/restaurants', required: true },
  { name: 'menu', path: './src/routes/menusRoutes', mount: '/menus', required: true },
  { name: 'orders', path: './src/routes/orderRoutes', mount: '/orders', required: true },
  { name: 'images', path: './src/routes/imageRoutes', mount: '/images', required: false },
  { name: 'admin', path: './src/routes/adminRoutes', mount: '/admin', required: true },
  { name: 'zones', path: './src/routes/zoneRoutes', mount: '/zones', required: false },
  { name: 'shops', path: './src/routes/zoneShopRoutes', mount: '/shops', required: false },
  { name: 'vendors', path: './src/routes/vendorRoutes', mount: '/vendors', required: false },
  { name: 'qr', path: './src/routes/qrCodeRoutes', mount: '/qr', required: false },
  { name: 'subscriptions', path: './src/routes/subscriptionRoutes', mount: '/subscriptions', required: false },
  { name: 'plans', path: './src/routes/planRoutes', mount: '/plans', required: false },
  { name: 'plan-usage', path: './src/routes/planUsageRoutes', mount: '/plan-usage', required: false },
  { name: 'payment', path: './src/routes/paymentRoutes', mount: '/payment', required: false },
  { name: 'upi-payments', path: './src/routes/upiPaymentRoutes', mount: '/upi-payments', required: true },
  { name: 'webhooks', path: './src/routes/webhookRoutes', mount: '/webhooks', required: false }, // Made optional
  { name: 'analytics', path: './src/routes/analyticsRoutes', mount: '/analytics', required: false },
  { name: 'reports', path: './src/routes/reportRoutes', mount: '/reports', required: false },
  { name: 'tableserve-ratings', path: './src/routes/tableServeRatingRoutes', mount: '/tableserve-ratings', required: false },
  { name: 'test', path: './src/routes/testRoutes', mount: '/test', required: false }
];

// Load all routes with enhanced reporting
logger.info('='.repeat(60));
logger.info('Starting route loading process...');
logger.info('='.repeat(60));

const loadedRoutes = new Map();
const skippedRoutes = [];
const missingRequiredRoutes = [];
let loadSuccessCount = 0;
let loadFailCount = 0;

routeConfigs.forEach(config => {
  const router = loadRoute(config);
  if (router) {
    loadedRoutes.set(config.name, { router, mount: config.mount, required: config.required });
    loadSuccessCount++;
  } else {
    if (config.required) {
      missingRequiredRoutes.push(config.name);
    } else {
      skippedRoutes.push(config.name);
    }
    loadFailCount++;
  }
});

// Enhanced reporting
logger.info('='.repeat(60));
logger.info('ROUTE LOADING SUMMARY');
logger.info('='.repeat(60));
logger.info(`Total routes processed: ${routeConfigs.length}`);
logger.info(`Successfully loaded: ${loadSuccessCount}`);
logger.info(`Failed/Skipped: ${loadFailCount}`);

if (loadedRoutes.size > 0) {
  logger.info(`\nLOADED ROUTES (${loadedRoutes.size}):`);
  Array.from(loadedRoutes.keys()).forEach(name => {
    const config = routeConfigs.find(c => c.name === name);
    logger.info(`  ✓ ${name} ${config.required ? '(required)' : '(optional)'}`);
  });
}

if (skippedRoutes.length > 0) {
  logger.info(`\nSKIPPED OPTIONAL ROUTES (${skippedRoutes.length}):`);
  skippedRoutes.forEach(name => {
    logger.info(`  - ${name} (optional - file not found)`);
  });
}

if (missingRequiredRoutes.length > 0) {
  logger.error(`\nMISSING REQUIRED ROUTES (${missingRequiredRoutes.length}):`);
  missingRequiredRoutes.forEach(name => {
    logger.error(`  ✗ ${name} (REQUIRED - server may not function properly)`);
  });
}

logger.info('='.repeat(60));

// Check if we have minimum required routes
if (missingRequiredRoutes.length > 0) {
  logger.error('CRITICAL: Required routes are missing. Server functionality will be limited.');
  logger.error('Please ensure the following route files exist:');
  missingRequiredRoutes.forEach(name => {
    const config = routeConfigs.find(c => c.name === name);
    logger.error(`  - ${config.path}.js`);
  });
  
  if (loadSuccessCount === 0) {
    logger.error('FATAL: No routes loaded successfully. Cannot start server.');
    process.exit(1);
  }
}

// Direct access to menu routes without redirects
logger.info('Menu routes configured for direct access without redirects');

// Mount routes with enhanced error handling
const apiBasePath = '/api/v1';
let mountSuccessCount = 0;
let mountFailCount = 0;
const mountedEndpoints = [];

logger.info('Starting route mounting process...');

loadedRoutes.forEach(({ router, mount, required }, name) => {
  try {
    const fullPath = `${apiBasePath}${mount}`;
    
    logger.info(`[MOUNT] Mounting ${name} at ${fullPath}`);
    
    // Mount with error isolation
    app.use(fullPath, (req, res, next) => {
      try {
        router(req, res, next);
      } catch (routeError) {
        logger.error(`Runtime error in route ${name}:`, routeError.message);
        next(routeError);
      }
    });
    
    mountSuccessCount++;
    mountedEndpoints.push({ name, path: fullPath, required });
    logger.info(`[MOUNT] Successfully mounted ${name} ${required ? '(required)' : '(optional)'}`);
    
  } catch (mountError) {
    logger.error(`[MOUNT] Failed to mount ${name}:`, mountError.message);
    
    if (mountError.message.includes('Missing parameter name')) {
      logger.error(`[MOUNT] Path-to-regexp error in ${name}. Check route definitions for:`);
      logger.error('  1. Routes ending with colon (:)');
      logger.error('  2. Empty parameters (/:/)');
      logger.error('  3. Malformed parameter syntax');
    }
    
    mountFailCount++;
    
    // If it's a required route, this is critical
    if (required) {
      logger.error(`[MOUNT] CRITICAL: Failed to mount required route ${name}`);
    }
  }
});

logger.info('='.repeat(60));
logger.info('ROUTE MOUNTING SUMMARY');
logger.info('='.repeat(60));
logger.info(`Successfully mounted: ${mountSuccessCount}`);
logger.info(`Failed to mount: ${mountFailCount}`);
logger.info(`Total endpoints: ${mountedEndpoints.length}`);

if (mountedEndpoints.length > 0) {
  logger.info('\nMOUNTED ENDPOINTS:');
  mountedEndpoints.forEach(({ name, path, required }) => {
    logger.info(`  ✓ ${path} (${name}) ${required ? '[REQUIRED]' : '[OPTIONAL]'}`);
  });
}

logger.info('='.repeat(60));

// API documentation endpoint
app.get('/api', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.json({
    success: true,
    message: 'TableServe API v1',
    data: {
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      statistics: {
        routesConfigured: routeConfigs.length,
        routesLoaded: loadSuccessCount,
        routesMounted: mountSuccessCount,
        routesFailed: loadFailCount,
        routesSkipped: skippedRoutes.length,
        requiredRoutesMissing: missingRequiredRoutes.length
      },
      endpoints: {
        health: `${baseUrl}/health`,
        test: `${baseUrl}/test`,
        config: `${baseUrl}/api/config`,
        docs: `${baseUrl}/api`
      },
      mountedRoutes: mountedEndpoints.map(({ path }) => `${baseUrl}${path}`),
      skippedRoutes: skippedRoutes,
      missingRequiredRoutes: missingRequiredRoutes
    }
  });
});

// Configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: {
      apiBaseUrl: `${req.protocol}://${req.get('host')}/api/v1`,
      websocketUrl: `${req.protocol}://${req.get('host')}`,
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      features: {
        websocket: true,
        fileUpload: true,
        rateLimiting: true,
        authentication: true
      },
      routeStatus: {
        loaded: Array.from(loadedRoutes.keys()),
        skipped: skippedRoutes,
        missingRequired: missingRequiredRoutes
      }
    }
  });
});

// Test endpoint for UPI payments
app.get('/upi-payments/test', (req, res) => {
  res.json({
    success: true,
    message: 'UPI payment endpoint is accessible',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `API endpoint ${req.originalUrl} not found`,
      suggestion: 'Visit /api for available endpoints',
      availableRoutes: mountedEndpoints.map(({ path }) => path)
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'TableServe Backend API',
    data: {
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      status: 'online',
      endpoints: {
        api: '/api',
        health: '/health',
        test: '/test'
      },
      routesSummary: {
        loaded: loadSuccessCount,
        total: routeConfigs.length,
        status: missingRequiredRoutes.length > 0 ? 'degraded' : 'optimal'
      }
    }
  });
});

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
      suggestion: 'Check /api for available endpoints'
    }
  });
});

// Enhanced error handler
app.use((error, req, res, next) => {
  logger.error('Global error handler:', error);
  
  // Don't send error details in production
  const errorResponse = {
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message,
      requestId: req.id
    }
  };
  
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.stack = error.stack;
  }
  
  res.status(error.status || 500).json(errorResponse);
});

// Server startup function
const startServer = async () => {
  try {
    logger.info('Starting TableServe Backend Server...');
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Node.js version: ${process.version}`);

    // Connect to database
    try {
      const { connectDatabase } = require('./src/config/database');
      await connectDatabase();
      logger.info('Database connected successfully');
    } catch (dbError) {
      logger.error('Database connection failed:', dbError.message);
      logger.warn('Continuing without database - some features may not work');
    }

    // Initialize superadmin if possible
    try {
      const { ensureSuperAdmin } = require('./src/utils/seedData');
      await ensureSuperAdmin();
      logger.info('Superadmin setup completed');
    } catch (adminError) {
      logger.warn('Superadmin setup failed:', adminError.message);
    }

    // Initialize Socket.io
    try {
      const socketService = require('./src/services/socketService');
      socketService.init(server);
      logger.info('Socket.io initialized successfully');
    } catch (socketError) {
      logger.warn('Socket.io initialization failed:', socketError.message);
    }

    // Start server
    const serverInstance = server.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`API docs: http://localhost:${PORT}/api`);
      logger.info(`Routes loaded: ${loadSuccessCount}/${routeConfigs.length}`);
      logger.info(`Routes mounted: ${mountSuccessCount}`);
      
      if (skippedRoutes.length > 0) {
        logger.info(`Optional routes skipped: ${skippedRoutes.join(', ')}`);
      }
      
      if (missingRequiredRoutes.length > 0) {
        logger.warn(`Missing required routes: ${missingRequiredRoutes.join(', ')}`);
      }
      
      logger.info('Server ready for connections!');
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`${signal} received: starting graceful shutdown`);
      
      serverInstance.close((err) => {
        if (err) {
          logger.error('Error during server close:', err);
        }
        
        // Close database connection
        try {
          const mongoose = require('mongoose');
          mongoose.connection.close();
          logger.info('Database connection closed');
        } catch (dbCloseError) {
          logger.warn('Database close error:', dbCloseError.message);
        }
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      });
      
      // Force close after timeout
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return serverInstance;

  } catch (error) {
    logger.error('Failed to start server:', error);
    
    if (error.message.includes('path-to-regexp')) {
      logger.error('Path-to-regexp error detected. Check route definitions for:');
      logger.error('1. Routes ending with colon (:)');
      logger.error('2. Empty parameters (/:/)');
      logger.error('3. Malformed parameter syntax');
    }
    
    process.exit(1);
  }
};

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Start server if run directly
if (require.main === module) {
  startServer().catch(error => {
    console.error('Startup failed:', error);
    process.exit(1);
  });
}

module.exports = { app, server, startServer };