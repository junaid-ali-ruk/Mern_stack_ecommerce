import Categories from "../components/Categories";
import FlashSales from "../components/Flashsales";
import Hero from "../components/Hero";
import MusicExperience from "../components/Musicexperience";
import Navbar from "../components/Navbar";
import NewArival from "../components/NewArival";
import OurProducts from "../components/Ourproducts";
import SellingProducts from "../components/Sellingproducts";
const Home = () => {
  return (
    <div>
      <Navbar />
      <Hero />
      <FlashSales/>
      <Categories/>
      <SellingProducts/>
      <MusicExperience/>
      <OurProducts/>
      <NewArival/>
    </div>
  );
};

export default Home;