const socketMap = new Map();

module.exports = {
  add(userId, socketId) {
    if (!socketMap.has(userId)) socketMap.set(userId, new Set());
    socketMap.get(userId).add(socketId);
  },
  remove(userId, socketId) {
    const sockets = socketMap.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size === 0) {
      socketMap.delete(userId);
      return true;
    }
    return false;
  },
  get(userId) {
    return socketMap.get(userId) || new Set();
  },
};
