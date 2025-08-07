import mongoose from "mongoose";

const loginHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ip: String,
  city: String,
  region: String,
  country: String,
  continent: String,
  latitude: Number,
  longitude: Number,
  currentTime: String,
  loginTime: { type: String },  
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("LoginHistory", loginHistorySchema);
