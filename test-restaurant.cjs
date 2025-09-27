const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tableserve', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
    return conn;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }
};

// Restaurant model
const restaurantSchema = new mongoose.Schema({
  name: String,
  slug: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'deleted'],
    default: 'active'
  },
  ownerId: mongoose.Schema.Types.ObjectId,
  subscriptionId: mongoose.Schema.Types.ObjectId,
}, {
  timestamps: true
});

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

// Test function
const testRestaurant = async () => {
  await connectDatabase();
  
  const restaurantId = '68bfb794f67ccd95ac375900';
  
  try {
    // Try to find the restaurant
    const restaurant = await Restaurant.findById(restaurantId);
    
    if (!restaurant) {
      console.log(`Restaurant with ID ${restaurantId} not found in database`);
      
      // Let's see what restaurants exist
      const allRestaurants = await Restaurant.find({}, 'name slug status ownerId');
      console.log('All restaurants in database:');
      allRestaurants.forEach(r => {
        console.log(`- ${r.name} (${r.slug}) - ${r.status} - Owner: ${r.ownerId}`);
      });
    } else {
      console.log('Restaurant found:');
      console.log(`- Name: ${restaurant.name}`);
      console.log(`- Slug: ${restaurant.slug}`);
      console.log(`- Status: ${restaurant.status}`);
      console.log(`- Owner ID: ${restaurant.ownerId}`);
      console.log(`- Subscription ID: ${restaurant.subscriptionId}`);
    }
  } catch (error) {
    console.error('Error querying restaurant:', error.message);
  } finally {
    mongoose.connection.close();
  }
};

testRestaurant();