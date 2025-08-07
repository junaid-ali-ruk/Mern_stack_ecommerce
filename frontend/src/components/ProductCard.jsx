import { Heart, Eye, Star } from "lucide-react";
import controler from "../assets/controler.png";

const ProductCard = () => {
  return (
    <div className="product-card-container">
      
      {/* Image Gray Container */}
      <div className="product-card">
        <span className="discount-badge">-40%</span>

        <div className="action-buttons">
          <button><Heart size={16} /></button>
          <button><Eye size={16} /></button>
        </div>

        <img
          src={controler}
          alt="Game Controller"
          className="product-image"
        />

        <button className="add-to-cart-btn">Add to Cart</button>
      </div>

      {/* Info Outside */}
      <div className="product-info">
        <h3 className="product-name">HAVIT Gamepad</h3>
        <div className="price-section">
          <span className="discounted-price">$120</span>
          <span className="original-price">$160</span>
        </div>
        <div className="rating">
          {[...Array(5)].map((_, i) => (
            <Star key={i} size={14} fill="#fbbf24" stroke="#fbbf24" />
          ))}
          <span className="reviews">(99)</span>
        </div>
      </div>

    </div>
  );
};

export default ProductCard;
