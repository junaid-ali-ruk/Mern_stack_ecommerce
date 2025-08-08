const axios = require('axios');
const NodeCache = require('node-cache');

class CurrencyService {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 3600 });
    this.baseUrl = 'https://api.exchangerate-api.com/v4/latest';
    this.supportedCurrencies = [
      'USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'SGD', 'AED', 'JPY', 'CNY'
    ];
  }

  async getExchangeRates(baseCurrency = 'USD') {
    const cacheKey = `rates_${baseCurrency}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/${baseCurrency}`);
      const rates = response.data.rates;
      
      this.cache.set(cacheKey, rates);
      return rates;
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error);
      return this.getFallbackRates();
    }
  }

  getFallbackRates() {
    return {
      USD: 1,
      EUR: 0.85,
      GBP: 0.73,
      INR: 83.12,
      AUD: 1.52,
      CAD: 1.36,
      SGD: 1.35,
      AED: 3.67,
      JPY: 149.50,
      CNY: 7.24
    };
  }

  async convert(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const rates = await this.getExchangeRates(fromCurrency);
    const rate = rates[toCurrency];

    if (!rate) {
      throw new Error(`Unsupported currency: ${toCurrency}`);
    }

    return {
      originalAmount: amount,
      originalCurrency: fromCurrency,
      convertedAmount: parseFloat((amount * rate).toFixed(2)),
      targetCurrency: toCurrency,
      exchangeRate: rate,
      timestamp: new Date()
    };
  }

  async convertMultiple(amount, fromCurrency, toCurrencies = []) {
    const rates = await this.getExchangeRates(fromCurrency);
    const conversions = {};

    for (const currency of toCurrencies) {
      if (rates[currency]) {
        conversions[currency] = {
          amount: parseFloat((amount * rates[currency]).toFixed(2)),
          rate: rates[currency]
        };
      }
    }

    return conversions;
  }

  formatCurrency(amount, currency, locale = 'en-US') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  async getPriceInUserCurrency(price, baseCurrency, userCurrency, locale) {
    if (baseCurrency === userCurrency) {
      return {
        amount: price,
        formatted: this.formatCurrency(price, userCurrency, locale)
      };
    }

    const conversion = await this.convert(price, baseCurrency, userCurrency);
    
    return {
      amount: conversion.convertedAmount,
      formatted: this.formatCurrency(conversion.convertedAmount, userCurrency, locale),
      originalAmount: price,
      originalFormatted: this.formatCurrency(price, baseCurrency, locale),
      exchangeRate: conversion.exchangeRate
    };
  }

  detectUserCurrency(req) {
    const acceptedCurrencies = req.headers['accept-currency'];
    if (acceptedCurrencies) {
      const preferred = acceptedCurrencies.split(',')[0].toUpperCase();
      if (this.supportedCurrencies.includes(preferred)) {
        return preferred;
      }
    }

    const countryToCurrency = {
      US: 'USD',
      GB: 'GBP',
      EU: 'EUR',
      IN: 'INR',
      AU: 'AUD',
      CA: 'CAD',
      SG: 'SGD',
      AE: 'AED',
      JP: 'JPY',
      CN: 'CNY'
    };

    const country = req.headers['cf-ipcountry'] || req.headers['x-country-code'];
    if (country && countryToCurrency[country]) {
      return countryToCurrency[country];
    }

    return 'USD';
  }

  async updateCachedRates() {
    for (const currency of this.supportedCurrencies) {
      await this.getExchangeRates(currency);
    }
  }
}

module.exports = new CurrencyService();