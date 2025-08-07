import { useRef } from "react";
import { LucideArrowLeft, LucideArrowRight } from "lucide-react";
import ProductCard from "./ProductCard";
const OurProducts = () => {
      const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 550;  
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });}}
   

 
 
    return (
        <div className="flashsales">
            <div className="our-title">
                <div className="rectangle"></div>
                <div className="text">Our Products</div>
            </div>

            <div className="ctdn">
                <div className="our-title">
                    <h1>Explore Our Products</h1>
                </div>

              


                <div className="arrows">
                    <div className="arrow" onClick={() => scroll("left")}>
                        <LucideArrowLeft size={20} />
                    </div>
                    <div className="arrow" onClick={() => scroll("right")}>
                        <LucideArrowRight size={20} />
                    </div>
                </div>
            </div>

            <div className="products" ref={scrollRef}>
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
            </div>
            <div style={{marginTop:"50px"}} className="products" >
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
                <ProductCard />
            </div>
            <div className="viewallproducts">
                <button>View All Products</button>
            </div>
            <div className="line"></div>
        </div>
    );
};

export default OurProducts;
