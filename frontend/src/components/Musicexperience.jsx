import { useState, useEffect } from "react";
import mp3Player from "../assets/headphone.png";   
const MusicExperience = () => {
  const [timeLeft, setTimeLeft] = useState({
    hours: 23,
    days: 5,
    minutes: 59,
    seconds: 35,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        let { hours, days, minutes, seconds } = prev;

        if (seconds > 0) {
          seconds--;
        } else if (minutes > 0) {
          seconds = 59;
          minutes--;
        } else if (hours > 0) {
          seconds = 59;
          minutes = 59;
          hours--;
        } else if (days > 0) {
          seconds = 59;
          minutes = 59;
          hours = 23;
          days--;
        }

        return { hours, days, minutes, seconds };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mct">
      <div className="music-experience">
        <div className="background-effects"></div>
        <div className="background-effects-2"></div>

        <div className="container">
          <div className="main-content">
            {/* LEFT */}
            <div className="left-content">
              <div className="categories">Categories</div>
              <h1 className="main-heading">
                Enhance Your <br /> Music Experience
              </h1>

              <div className="countdown">
                <div className="countdown-item">
                  <div className="countdown-circle">
                    {String(timeLeft.hours).padStart(2, "0")}
                  </div>
                  <div className="countdown-label">Hours</div>
                </div>
                <div className="countdown-item">
                  <div className="countdown-circle">
                    {String(timeLeft.days).padStart(2, "0")}
                  </div>
                  <div className="countdown-label">Days</div>
                </div>
                <div className="countdown-item">
                  <div className="countdown-circle">
                    {String(timeLeft.minutes).padStart(2, "0")}
                  </div>
                  <div className="countdown-label">Minutes</div>
                </div>
                <div className="countdown-item">
                  <div className="countdown-circle">
                    {String(timeLeft.seconds).padStart(2, "0")}
                  </div>
                  <div className="countdown-label">Seconds</div>
                </div>
              </div>

              <button className="cta-button">Buy Now!</button>
            </div>

            {/* RIGHT */}
            <div className="right-content">
              <div className="image-wrapper">
               <div className="white-shadow"></div>
                <img src={mp3Player} alt="MP3 Player" className="mp3-player" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MusicExperience;
