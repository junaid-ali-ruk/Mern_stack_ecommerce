import { config } from "dotenv";
config();

import axios from "axios";

export const getLoginDetails = async (req) => {

  let locationData = {};
  try {
    const { data } = await axios.get(`http://ipwho.is`);

    if (data.success) {
      locationData = {
        ip: data.ip,
        continent: data.continent,
        country: data.country,
        country_code: data.country_code,
        region: data.region,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        currentTime: data.timezone?.current_time || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error("Error fetching IP location info:", err.message);
  }

  return {
    ...locationData,
    time: new Date().toLocaleString(),
  };
};
