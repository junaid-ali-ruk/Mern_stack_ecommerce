const Redis = require('ioredis');

class CacheService {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: 0,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });
    
    this.defaultTTL = 3600;
  }

  async get(key) {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(value)
      );
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async flush() {
    try {
      await this.redis.flushdb();
      return true;
    } catch (error) {
      console.error('Cache flush error:', error);
      return false;
    }
  }

  async remember(key, ttl, callback) {
    const cached = await this.get(key);
    
    if (cached !== null) {
      return cached;
    }
    
    const fresh = await callback();
    await this.set(key, fresh, ttl);
    
    return fresh;
  }

  async invalidate(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return keys.length;
    } catch (error) {
      console.error('Cache invalidate error:', error);
      return 0;
    }
  }

  async increment(key, value = 1) {
    try {
      return await this.redis.incrby(key, value);
    } catch (error) {
      console.error('Cache increment error:', error);
      return null;
    }
  }

  async decrement(key, value = 1) {
    try {
      return await this.redis.decrby(key, value);
    } catch (error) {
      console.error('Cache decrement error:', error);
      return null;
    }
  }

  async exists(key) {
    try {
      return await this.redis.exists(key);
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  async expire(key, ttl) {
    try {
      return await this.redis.expire(key, ttl);
    } catch (error) {
      console.error('Cache expire error:', error);
      return false;
    }
  }

  async lpush(key, value) {
    try {
      return await this.redis.lpush(key, JSON.stringify(value));
    } catch (error) {
      console.error('Cache lpush error:', error);
      return null;
    }
  }

  async lrange(key, start, stop) {
    try {
      const data = await this.redis.lrange(key, start, stop);
      return data.map(item => JSON.parse(item));
    } catch (error) {
      console.error('Cache lrange error:', error);
      return [];
    }
  }

  async sadd(key, member) {
    try {
      return await this.redis.sadd(key, member);
    } catch (error) {
      console.error('Cache sadd error:', error);
      return null;
    }
  }

  async smembers(key) {
    try {
      return await this.redis.smembers(key);
    } catch (error) {
      console.error('Cache smembers error:', error);
      return [];
    }
  }

  async zadd(key, score, member) {
    try {
      return await this.redis.zadd(key, score, member);
    } catch (error) {
      console.error('Cache zadd error:', error);
      return null;
    }
  }

  async zrange(key, start, stop, withScores = false) {
    try {
      if (withScores) {
        return await this.redis.zrange(key, start, stop, 'WITHSCORES');
      }
      return await this.redis.zrange(key, start, stop);
    } catch (error) {
      console.error('Cache zrange error:', error);
      return [];
    }
  }

  generateKey(...parts) {
    return parts.join(':');
  }

  async clearPattern(pattern) {
    const keys = await this.redis.keys(pattern);
    if (keys.length === 0) return 0;
    
    const pipeline = this.redis.pipeline();
    keys.forEach(key => pipeline.del(key));
    await pipeline.exec();
    
    return keys.length;
  }
}

module.exports = new CacheService();