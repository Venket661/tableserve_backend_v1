const axios = require('axios');

const testRestaurantEndpoint = async () => {
  const restaurantId = '68bfb794f67ccd95ac375900';
  const apiUrl = 'http://localhost:8080/api/v1/restaurants/public/id/' + restaurantId;
  
  console.log(`Testing API endpoint: ${apiUrl}`);
  
  try {
    const response = await axios.get(apiUrl);
    console.log('API Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('API Error Response:');
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
};

testRestaurantEndpoint();