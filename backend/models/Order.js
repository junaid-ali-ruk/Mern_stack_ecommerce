import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      quantity: { type: Number, required: true },
    }
  ],
  shippingInfo: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true }
  },
  totalAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["Pending", "Shipped", "Delivered"],
    default: "Pending"
  },
  paymentStatus: {
    type: String,
    enum: ["Not Paid", "Paid"],
    default: "Not Paid"
  }
}, { timestamps: true });

export default mongoose.model("Order", orderSchema);
