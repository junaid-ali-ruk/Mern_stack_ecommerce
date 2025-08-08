const socketIO = require('socket.io');

class SocketService {
  initialize(server) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true
      }
    });

    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('join-order', (orderId) => {
        socket.join(`order-${orderId}`);
      });

      socket.on('join-admin', () => {
        socket.join('admin-dashboard');
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  emitOrderUpdate(orderId, update) {
    this.io.to(`order-${orderId}`).emit('order-update', update);
  }

  emitAdminUpdate(type, data) {
    this.io.to('admin-dashboard').emit('dashboard-update', { type, data });
  }

  emitNewOrder(order) {
    this.io.to('admin-dashboard').emit('new-order', order);
  }
}

module.exports = new SocketService();