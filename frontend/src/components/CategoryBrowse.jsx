import { Phone, Laptop, Watch, Camera, Headphones, GamepadIcon, ArrowBigLeft, ArrowRight, ArrowLeft } from 'lucide-react';  
 

const CategoryBrowse = () => {
  return (
    <div className="category-container">
     <div className="titwar">
       <div className="title">
        <div className='rectangle'></div>
        <div className="text">Categories</div>
      </div>
      <div className="arrows">
        <div className="arrow">
          <ArrowLeft/>
        </div>
        <div className="arrow">
               <ArrowRight/>
        </div>
      </div>
     </div>
      <div className="header">
        <h1>Browse By Category</h1>
      </div>
      <div className="categories">
        <div className="category-item">
          <Phone size={40} />
          <p>Phones</p>
        </div>
        <div className="category-item">
          <Laptop size={40} />
          <p>Computers</p>
        </div>
        <div className="category-item active">
          <Camera size={40} />
          <p>Camera</p>
        </div>
        <div className="category-item">
          <Watch size={40} />
          <p>SmartWatch</p>
        </div>
        <div className="category-item">
          <Headphones size={40} />
          <p>HeadPhones</p>
        </div>
        <div className="category-item">
          <GamepadIcon size={40} />
          <p>Gaming</p>
        </div>
      </div>
      <div className="line"></div>
    </div>
  );
};

export default CategoryBrowse;
