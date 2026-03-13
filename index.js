'use strict';

const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`HallPass server running on http://localhost:${PORT}`);
  console.log('Default admin login: admin / admin123');
});
