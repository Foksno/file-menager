const { createApp } = require('./app');

const PORT = process.env.ACTIVITY_PORT || 3002;

createApp().listen(PORT, () => {
  console.log(`activity-service na porcie ${PORT}`);
});
