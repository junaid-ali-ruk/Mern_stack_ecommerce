import { useState } from "react";
import { Link } from "react-router-dom";
import LanguageSelector from "./LanguageSelector";
import searchicon from "../assets/searchicon.png";
import carticon from "../assets/carticon.png";
import wishlisticon from "../assets/wishlisticon.png";

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="navbar">
      <div className="offer">
        <div className="top-header">
          <p className="top-header-p">
            Summer Sale For All Swim Suits And Free Express Delivery - OFF 50%!
          </p>
          <div className="top-header-btn">
            <Link to={"/"}>ShopNow</Link>
          </div>
          <LanguageSelector />
        </div>
      </div>

      <div className="navlinks">
        <div className="logo">
          <h1>Exclusive</h1>
        </div>

        {/* Hamburger Icon */}
        <div className="hamburger" onClick={() => setMenuOpen(!menuOpen)}>
          <div className="bar"></div>
          <div className="bar"></div>
          <div className="bar"></div>
        </div>

        {/* Nav Links - Hide on small screens */}
        <div className={`links ${menuOpen ? "active" : ""}`}>
          <ul>
            <li><Link to={"/"}>Home</Link></li>
            <li><Link to={"/"}>Contact</Link></li>
            <li><Link to={"/"}>About</Link></li>
            <li><Link to={"/"}>Signup</Link></li>
          </ul>
        </div>

        <div className="search">
          <div className="input-box">
            <input type="text" placeholder="What are you looking for?" />
            <Link to={"/"}><img src={searchicon} alt="" /></Link>
          </div>
        </div>

        <div className="icons">
          <div className="wishlisticon">
            <Link to={"/"}><img src={wishlisticon} alt="" /></Link>
          </div>
          <div className="carticon">
            <Link to={"/"}><img src={carticon} alt="" /></Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
