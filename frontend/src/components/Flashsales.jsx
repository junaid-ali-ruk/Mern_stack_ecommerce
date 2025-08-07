import { useState, useEffect,useRef } from "react";
import { LucideArrowLeft, LucideArrowRight } from "lucide-react";
import ProductCard from "./ProductCard";
const FlashSales = () => {
      const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 550;  
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });}}
    const [time, setTime] = useState({
        hours: 0,
        minutes: 0,
        seconds: 0,
    });

    useEffect(() => {
        const target = new Date();
        target.setHours(target.getHours() + 5);  

        const timer = setInterval(() => {
            const now = new Date();
            const diff = target - now;

            if (diff <= 0) {
                clearInterval(timer);
                setTime({ hours: 0, minutes: 0, seconds: 0 });
                return;
            }

            const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const m = Math.floor((diff / (1000 * 60)) % 60);
            const s = Math.floor((diff / 1000) % 60);

            setTime({ hours: h, minutes: m, seconds: s });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const formatNumber = (num) => num.toString().padStart(2, "0");

    return (
        <div className="flashsales">
            <div className="title">
                <div className="rectangle"></div>
                <div className="text">Today`s</div>
            </div>

            <div className="ctdn">
                <div className="title">
                    <h1>Flash Sales</h1>
                </div>

                <div className="countdown">
                    <div className="bx">
                        <label>hours</label>
                        <div className="time">{formatNumber(time.hours)}</div>
                    </div>
                    <span className="colon">:</span>
                    <div className="bx">
                        <label>minutes</label>
                        <div className="time">{formatNumber(time.minutes)}</div>
                    </div>
                    <span className="colon">:</span>
                    <div className="bx">
                        <label>seconds</label>
                        <div className="time">{formatNumber(time.seconds)}</div>
                    </div>
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
            <div className="viewallproducts">
                <button>View All Products</button>
            </div>
            <div className="line"></div>
        </div>
    );
};

export default FlashSales;
