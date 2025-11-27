const mongoose = require("mongoose");
const env = require("dotenv").config();


const connectDB = async () => {
    try {
  console.log('MONGO_URI:', process.env.MONGO_URI ? 'LOADED ✅' : 'MISSING ❌');
        console.log('Full URI (first 50 chars):', process.env.MONGO_URI?.substring(0, 50));
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Database connected Successfully..!!");
        

    } catch (error) {

        console.log("DB connection error",error.message);
        process.exit(1)
    }
}


module.exports = connectDB;