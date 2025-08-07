import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import { Link } from "react-router-dom"
import "swiper/css";
import "swiper/css/pagination";

export default function SliderWithMenu() {
    const slides = [
        {
            id: 1,
            img: "/src/assets/iphone.png",
            title: "iPhone 14 Series",
            discount: "Up to 10% off Voucher",
            link: "#",
        },
        {
            id: 2,
            img: "/src/assets/iphone.png",
            title: "iPhone 14 Series",
            discount: "Up to 10% off Voucher",
            link: "#",
        },
        {
            id: 3,
            img: "/src/assets/iphone.png",
            title: "iPhone 14 Series",
            discount: "Up to 10% off Voucher",
            link: "#",
        },
    ];

    const menuItems = [
        "Woman's Fashion >",
        "Men's Fashion >",
        "Electronics",
        "Home & Lifestyle",
        "Medicine",
        "Sports & Outdoor",
        "Baby's & Toys",
        "Groceries & Pets",
        "Health & Beauty",
    ];

    return (
        <div className="slider-menu-container">
            <div className="menu">
                {menuItems.map((item, index) => (
                    <div className="menu-item" key={index}>
                        <Link>{item}</Link>
                    </div>
                ))}
            </div>
            <div className="slider">
                <Swiper
                    modules={[Autoplay, Pagination]}
                    autoplay={{ delay: 3000, disableOnInteraction: false }}
                    loop
                >
                    {slides.map((slide) => (
                        <SwiperSlide
                            modules={[Pagination]}
                            pagination={{
                                clickable: true,
                                el: ".custom-pagination",
                            }}
                            key={slide.id}>
                            <div className="slide-content">
                                <div className="slide-text">
                                    <h3><img src="./src/assets/applelogo.png" alt="" /> {slide.title}</h3>
                                    <p>{slide.discount}</p>
                                    <Link to={slide.link} className="shop-now">
                                        Shop Now <img src="./src/assets/arrowright.png" alt="" />
                                    </Link>
                                </div>
                                <div className="slide-img">
                                    <img src={slide.img} alt={slide.title} />
                                </div>
                            </div>
                        </SwiperSlide>
                    ))}
                </Swiper>
            </div>
        </div>
    );
}
