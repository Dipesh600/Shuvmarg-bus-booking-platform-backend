const http = require('http');
const mongoose = require('mongoose');
const User = require('./models/userModel.js');
const jwt = require('jsonwebtoken');
require('dotenv').config();

mongoose.connect('mongodb://127.0.0.1:27017/shuvmarg').then(async () => {
    const user = await User.findOne();
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.SECRET_KEY || 'shuvmarg@2024');
    mongoose.disconnect();

    const data = JSON.stringify({ tripId: "6a0566848ebd7314d3e82abf" });

    const options = {
      hostname: '127.0.0.1',
      port: 7012,
      path: '/api/ticket/getSeats',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'Content-Length': data.length
      }
    };

    const req = http.request(options, res => {
      console.log('Headers:', res.headers);
    });
    req.write(data);
    req.end();
});
