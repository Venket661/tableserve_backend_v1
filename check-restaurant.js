const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

// Restaurant model schema
const restaurantSchema = new mongoose.Schema({
  name: String,
  status: String,
  ownerId: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

async function checkRestaurant() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tableserve');
    console.log('Connected to database');

    // Check if restaurant exists
    const restaurantId = '68bfb794f67ccd95ac375900';
    console.log(`Checking for restaurant with ID: ${restaurantId}`);
    
    const restaurant = await Restaurant.findById(restaurantId);
    
    if (restaurant) {
      console.log('Restaurant found:', {
        id: restaurant._id,
        name: restaurant.name,
        status: restaurant.status,
        ownerId: restaurant.ownerId
      });
    } else {
      console.log('Restaurant not found with ID:', restaurantId);
      
      // List all restaurants to see what IDs exist
      const allRestaurants = await Restaurant.find({}, '_id name status');
      console.log('All restaurants in database:');
      allRestaurants.forEach(r => {
        console.log(`  ${r._id} - ${r.name} (${r.status})`);
      });
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error checking restaurant:', error);
  }
}

checkRestaurant();