const app = require('./app');

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.listen(PORT, () => {
  if (isProduction) {
    console.log(`SANDRONMART listening on port ${PORT} (production)`);
    return;
  }
  const url = `http://localhost:${PORT}`;
  console.log(`SANDRONMART running at ${url}`);
  const open = process.platform === 'win32'
    ? `start ${url}`
    : process.platform === 'darwin'
      ? `open ${url}`
      : `xdg-open ${url}`;
  setTimeout(() => {
    require('child_process').exec(open, (error) => {
      if (error) {
        console.log(`Open your browser at ${url}`);
      }
    });
  }, 300);
});