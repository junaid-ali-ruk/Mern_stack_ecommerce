import ProductCard from "./ProductCard";

const SellingProducts = () => {
  return (
    <div className="SellingProducts">
       <div className="titlet">
                <div className="rectangle"></div>
                <div className="text">Today`s</div>
            </div>
            <div className="dtl">
                <div className="title">
                    <h1>Best Selling Products</h1>
                </div>
                <div className="btn">
                    <button>View All</button>
                </div>
            </div>
            <div className="products">
                <ProductCard/>
                <ProductCard/>
                <ProductCard/>
                <ProductCard/>
                <ProductCard/>
            </div>
    </div>
  );
};

export default SellingProducts;