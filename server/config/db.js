import mongoose from "mongoose";

const CONNECTDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);

    console.log("✅ MongoDB Connected");

  } catch (err) {
    console.error("Mongo Error");
    console.error(err);
    process.exit(1);
  }
};

export default CONNECTDB;
