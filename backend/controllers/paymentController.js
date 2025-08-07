import dotenv from "dotenv";
dotenv.config();

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createStripeSession = async (req, res) => {
  try {
    const { items } = req.body;

    const line_items = items.map(item => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.title
        },
        unit_amount: item.price * 100
      },
      quantity: item.quantity
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items,
      mode: "payment",
      success_url: `${process.env.CLIENT_URL}/payment-success`,
      cancel_url: `${process.env.CLIENT_URL}/payment-cancel`
    });

    res.json({ id: session.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
