const axios = require('axios');

class DeliveryService {
  constructor() {
    this.carriers = {
      fedex: this.calculateFedExDelivery.bind(this),
      ups: this.calculateUPSDelivery.bind(this),
      usps: this.calculateUSPSDelivery.bind(this),
      dhl: this.calculateDHLDelivery.bind(this)
    };

    this.shippingZones = {
      'same-state': { standard: 2, express: 1, overnight: 1 },
      'neighboring': { standard: 3, express: 2, overnight: 1 },
      'regional': { standard: 5, express: 3, overnight: 1 },
      'cross-country': { standard: 7, express: 4, overnight: 1 },
      'international': { standard: 14, express: 7, overnight: 3 }
    };
  }

  async calculateDeliveryDate(origin, destination, shippingMethod, carrier = null) {
    const zone = await this.determineShippingZone(origin, destination);
    const transitDays = this.shippingZones[zone][shippingMethod] || 5;
    
    const deliveryDate = this.addBusinessDays(new Date(), transitDays);
    
    const holidays = await this.getHolidays(deliveryDate.getFullYear());
    const finalDate = this.adjustForHolidays(deliveryDate, holidays);

    if (carrier && this.carriers[carrier]) {
      try {
        const carrierEstimate = await this.carriers[carrier](origin, destination, shippingMethod);
        if (carrierEstimate) {
          return carrierEstimate;
        }
      } catch (error) {
        console.error(`Carrier API error for ${carrier}:`, error);
      }
    }

    return {
      estimatedDelivery: finalDate,
      transitDays,
      shippingZone: zone,
      businessDays: this.countBusinessDays(new Date(), finalDate),
      carrier: carrier || 'standard'
    };
  }

  async determineShippingZone(origin, destination) {
    const distance = await this.calculateDistance(origin, destination);
    
    if (distance < 100) return 'same-state';
    if (distance < 300) return 'neighboring';
    if (distance < 1000) return 'regional';
    if (distance < 3000) return 'cross-country';
    return 'international';
  }

  async calculateDistance(origin, destination) {
    if (origin.country !== destination.country) {
      return 5000;
    }

    const R = 3959;
    const lat1 = origin.latitude || 40.7128;
    const lon1 = origin.longitude || -74.0060;
    const lat2 = destination.latitude || 34.0522;
    const lon2 = destination.longitude || -118.2437;

    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
  }

  toRad(value) {
    return value * Math.PI / 180;
  }

  addBusinessDays(startDate, days) {
    const date = new Date(startDate);
    let addedDays = 0;

    while (addedDays < days) {
      date.setDate(date.getDate() + 1);
      
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        addedDays++;
      }
    }

    return date;
  }

  countBusinessDays(startDate, endDate) {
    let count = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  async getHolidays(year) {
    const holidays = [
      new Date(year, 0, 1),
      new Date(year, 6, 4),
      new Date(year, 11, 25),
      this.getThanksgiving(year),
      this.getMemorialDay(year),
      this.getLaborDay(year)
    ];

    return holidays;
  }

  getThanksgiving(year) {
    const november = new Date(year, 10, 1);
    const dayOfWeek = november.getDay();
    const thursday = 4;
    const daysUntilThursday = (thursday - dayOfWeek + 7) % 7;
    const firstThursday = 1 + daysUntilThursday;
    return new Date(year, 10, firstThursday + 21);
  }

  getMemorialDay(year) {
    const may = new Date(year, 4, 31);
    const dayOfWeek = may.getDay();
    const monday = 1;
    const daysToSubtract = (dayOfWeek - monday + 7) % 7;
    return new Date(year, 4, 31 - daysToSubtract);
  }

  getLaborDay(year) {
    const september = new Date(year, 8, 1);
    const dayOfWeek = september.getDay();
    const monday = 1;
    const daysUntilMonday = (monday - dayOfWeek + 7) % 7;
    return new Date(year, 8, 1 + daysUntilMonday);
  }

  adjustForHolidays(date, holidays) {
    let adjustedDate = new Date(date);
    
    while (holidays.some(holiday => 
      holiday.getDate() === adjustedDate.getDate() &&
      holiday.getMonth() === adjustedDate.getMonth()
    )) {
      adjustedDate.setDate(adjustedDate.getDate() + 1);
      
      if (adjustedDate.getDay() === 0) {
        adjustedDate.setDate(adjustedDate.getDate() + 1);
      }
      if (adjustedDate.getDay() === 6) {
        adjustedDate.setDate(adjustedDate.getDate() + 2);
      }
    }

    return adjustedDate;
  }

  async calculateFedExDelivery(origin, destination, method) {
    return null;
  }

  async calculateUPSDelivery(origin, destination, method) {
    return null;
  }

  async calculateUSPSDelivery(origin, destination, method) {
    return null;
  }

  async calculateDHLDelivery(origin, destination, method) {
    return null;
  }

  async trackShipment(carrier, trackingNumber) {
    const trackingUrls = {
      fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
      usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
      dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`
    };

    return {
      carrier,
      trackingNumber,
      trackingUrl: trackingUrls[carrier] || '#',
      status: 'in_transit',
      lastUpdate: new Date(),
      estimatedDelivery: this.addBusinessDays(new Date(), 3)
    };
  }
}

module.exports = new DeliveryService();