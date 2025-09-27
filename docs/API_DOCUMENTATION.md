# TableServe Backend API Documentation

## Overview

The TableServe Backend API is a comprehensive multi-tenant QR-based restaurant ordering platform that provides endpoints for managing restaurants, zones, shops, menus, orders, analytics, and reports.

**Base URL:** `http://localhost:5000/api/v1`  
**Environment:** Development  
**Version:** 1.0.0

## Authentication

All protected endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

### Authentication Endpoints

#### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "64a7b8c9d0e1f2a3b4c5d6e7",
      "email": "user@example.com",
      "role": "restaurant_owner"
    }
  }
}
```

#### Register
```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "phone": "+1234567890",
  "password": "password123",
  "role": "restaurant_owner",
  "profile": {
    "name": "John Doe"
  }
}
```

## User Roles

- **admin**: Platform administrator with full access
- **restaurant_owner**: Manages their own restaurant
- **zone_admin**: Manages a zone and its shops
- **zone_shop**: Shop owner within a zone

## Analytics Endpoints

### Generate Analytics
```http
POST /analytics/generate
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "entityType": "restaurant",
  "entityId": "64a7b8c9d0e1f2a3b4c5d6f0",
  "period": "day",
  "date": "2024-08-26T00:00:00.000Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Analytics generated successfully",
  "data": {
    "id": "64a7b8c9d0e1f2a3b4c5d6f8",
    "entityType": "restaurant",
    "entityId": "64a7b8c9d0e1f2a3b4c5d6f0",
    "period": "day",
    "metrics": {
      "orders": {
        "total": 25,
        "completed": 20,
        "cancelled": 2,
        "pending": 3,
        "averageValue": 28.50,
        "completionRate": 80
      },
      "revenue": {
        "total": 570.00,
        "gross": 570.00,
        "net": 542.65,
        "fees": 27.35
      },
      "customers": {
        "total": 15,
        "new": 5,
        "returning": 10,
        "averageOrderValue": 38.00
      }
    }
  }
}
```

### Get Analytics
```http
GET /analytics/{entityType}/{entityId}
Authorization: Bearer <token>
```

**Parameters:**
- `entityType`: restaurant, zone, shop, platform
- `entityId`: ID of the entity
- `period` (query): day, week, month, year
- `startDate` (query): ISO date string
- `endDate` (query): ISO date string
- `limit` (query): Number of records (default: 30)

### Get Analytics Summary
```http
GET /analytics/{entityType}/{entityId}/summary
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "startDate": "2024-08-01T00:00:00.000Z",
      "endDate": "2024-08-31T23:59:59.999Z",
      "type": "month"
    },
    "current": {
      "orders": 100,
      "revenue": 5000,
      "customers": 60
    },
    "comparison": {
      "orders": 15.5,
      "revenue": 22.3,
      "customers": 18.2
    }
  }
}
```

### Get Analytics Trends
```http
GET /analytics/{entityType}/{entityId}/trends
Authorization: Bearer <token>
```

**Parameters:**
- `metric` (query): revenue, orders, customers, items
- `period` (query): hour, day, week, month
- `duration` (query): Number of periods (default: 30)

### Get Dashboard Analytics
```http
GET /analytics/dashboard
Authorization: Bearer <token>
```

For admin users, returns platform-wide dashboard. For other users, requires `entityType` and `entityId` query parameters.

## UPI Payment Endpoints

### Create UPI Order
```http
POST /upi-payments/create-order
```

**Request Body:**
```json
{
  "amount": 250,
  "restaurant_id": "restaurant_object_id",
  "customer_id": "customer_object_id",
  "payment_method": "upi"
}
```

**Response:**
```json
{
  "success": true,
  "order_id": "order_KQbX7SZc5G...",
  "amount": 250,
  "restaurant_upi": "restaurant@upi"
}
```

### Handle UPI Webhook
```http
POST /upi-payments/webhook
```

**Headers:**
- `x-razorpay-signature`: Webhook signature

**Request Body:**
```json
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_KQbX7SZc5G...",
        "order_id": "order_KQbX7SZc5G...",
        "status": "captured"
      }
    }
  }
}
```

### Check Order Status
```http
GET /upi-payments/check-order-status?order_id=order_KQbX7SZc5G...
```

**Response:**
```json
{
  "success": true,
  "order_id": "order_KQbX7SZc5G...",
  "status": "paid",
  "order_status": "confirmed"
}
```

## Reports Endpoints

### Create Report
```http
POST /reports
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Monthly Sales Report",
  "description": "Comprehensive monthly sales analysis",
  "type": "sales_summary",
  "entityType": "restaurant",
  "entityId": "64a7b8c9d0e1f2a3b4c5d6f0",
  "configuration": {
    "dateRange": {
      "type": "last_30_days"
    },
    "metrics": ["orders_total", "revenue_total", "customers_total"],
    "format": "json"
  }
}
```

### Execute Report
```http
POST /reports/{reportId}/execute
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Report executed successfully",
  "data": {
    "report": {
      "title": "Monthly Sales Report",
      "generated": "2024-08-26T10:30:00.000Z",
      "data": {
        "summary": { /* report data */ }
      }
    },
    "execution": {
      "duration": 1250,
      "recordsProcessed": 100,
      "fileUrl": null
    }
  }
}
```

### Schedule Report
```http
POST /reports/{reportId}/schedule
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "enabled": true,
  "frequency": "weekly",
  "dayOfWeek": 1,
  "time": "09:00"
}
```

## Zone Management Endpoints

### Create Zone
```http
POST /zones
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "adminId": "64a7b8c9d0e1f2a3b4c5d6e9",
  "subscriptionId": "64a7b8c9d0e1f2a3b4c5d6f3",
  "name": "Downtown Food Court",
  "description": "Premium downtown food court zone",
  "location": "123 Main Street, Downtown",
  "contactInfo": {
    "email": "admin@foodcourt.com",
    "phone": "+1234567890"
  }
}
```

### Get All Zones
```http
GET /zones
Authorization: Bearer <token>
```

**Parameters:**
- `page` (query): Page number (default: 1)
- `limit` (query): Items per page (default: 10)
- `search` (query): Search term
- `status` (query): active, inactive

### Get Zone by ID
```http
GET /zones/{zoneId}
Authorization: Bearer <token>
```

**Parameters:**
- `includeShops` (query): true/false - Include shops in response

### Update Zone
```http
PUT /zones/{zoneId}
Authorization: Bearer <token>
```

## Zone Shop Management

### Create Zone Shop
```http
POST /shops
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "ownerId": "64a7b8c9d0e1f2a3b4c5d6ea",
  "zoneId": "64a7b8c9d0e1f2a3b4c5d6f2",
  "name": "Burger Palace",
  "description": "Premium burger joint",
  "category": "fast_food",
  "contactInfo": {
    "email": "owner@burgerpalace.com",
    "phone": "+1234567890"
  }
}
```

### Get Zone Shops
```http
GET /shops
Authorization: Bearer <token>
```

**Parameters:**
- `zoneId` (query): Filter by zone
- `status` (query): active, inactive, pending
- `category` (query): Shop category

## Menu Management

### Get Menu
```http
GET /menu/{entityType}/{entityId}
Authorization: Bearer <token>
```

**Parameters:**
- `entityType`: restaurant, zone, shop
- `categoryId` (query): Filter by category
- `available` (query): true/false

### Create Menu Category
```http
POST /menu/categories
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Main Courses",
  "description": "Hearty main course dishes",
  "entityType": "restaurant",
  "entityId": "64a7b8c9d0e1f2a3b4c5d6f0",
  "sortOrder": 1
}
```

### Create Menu Item
```http
POST /menu/items
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "categoryId": "64a7b8c9d0e1f2a3b4c5d6f7",
  "name": "Classic Burger",
  "description": "Juicy beef patty with fresh toppings",
  "price": 12.99,
  "available": true,
  "modifiers": [
    {
      "name": "Size",
      "required": true,
      "options": [
        { "name": "Regular", "price": 0 },
        { "name": "Large", "price": 2.00 }
      ]
    }
  ]
}
```

## Order Management

### Create Order
```http
POST /orders
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "restaurantId": "64a7b8c9d0e1f2a3b4c5d6f0",
  "tableNumber": "5",
  "customer": {
    "name": "John Doe",
    "phone": "+1234567890",
    "email": "john@example.com"
  },
  "items": [
    {
      "menuItemId": "64a7b8c9d0e1f2a3b4c5d6f6",
      "quantity": 2,
      "modifiers": [
        {
          "name": "Size",
          "option": "Large"
        }
      ]
    }
  ]
}
```

### Update Order Status
```http
PATCH /orders/{orderId}/status
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "status": "confirmed",
  "notes": "Order confirmed and being prepared"
}
```

## Error Responses

All endpoints may return these error responses:

### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "email",
        "message": "Valid email required",
        "value": "invalid-email"
      }
    ]
  }
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "message": "Access token required"
  }
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "message": "Insufficient permissions"
  }
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": {
    "message": "Resource not found"
  }
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": {
    "message": "Internal server error"
  }
}
```

## Rate Limiting

API endpoints are rate limited to prevent abuse:

- **General endpoints**: 100 requests per 15 minutes per IP
- **Authentication endpoints**: 5 login attempts per 15 minutes per IP
- **Analytics generation**: 10 requests per hour per user

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1630000000
```

## Pagination

List endpoints support pagination with the following parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

Response includes pagination metadata:
```json
{
  "success": true,
  "count": 25,
  "pagination": {
    "page": 1,
    "pages": 3,
    "total": 75,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "data": [...]
}
```

## WebSocket Events

The API supports real-time communication via Socket.io:

### Connection
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Events

#### Order Events
- `order:created` - New order placed
- `order:updated` - Order status changed
- `order:cancelled` - Order cancelled

#### Shop Events
- `shop:status_changed` - Shop status updated
- `shop:new_order` - New order for shop

#### Zone Events
- `zone:shop_added` - New shop added to zone
- `zone:analytics_updated` - Zone analytics updated

## SDK Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:5000/api/v1',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Get analytics
const analytics = await api.get('/analytics/restaurant/64a7b8c9d0e1f2a3b4c5d6f0');

// Create order
const order = await api.post('/orders', {
  restaurantId: '64a7b8c9d0e1f2a3b4c5d6f0',
  tableNumber: '5',
  customer: { name: 'John Doe', phone: '+1234567890' },
  items: [{ menuItemId: '64a7b8c9d0e1f2a3b4c5d6f6', quantity: 2 }]
});
```

### Python
```python
import requests

headers = {'Authorization': f'Bearer {token}'}
base_url = 'http://localhost:5000/api/v1'

# Get analytics
response = requests.get(f'{base_url}/analytics/restaurant/64a7b8c9d0e1f2a3b4c5d6f0', headers=headers)
analytics = response.json()

# Create order
order_data = {
    'restaurantId': '64a7b8c9d0e1f2a3b4c5d6f0',
    'tableNumber': '5',
    'customer': {'name': 'John Doe', 'phone': '+1234567890'},
    'items': [{'menuItemId': '64a7b8c9d0e1f2a3b4c5d6f6', 'quantity': 2}]
}
response = requests.post(f'{base_url}/orders', json=order_data, headers=headers)
```

## Testing

The API includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Environment Variables

Required environment variables:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/tableserve
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```