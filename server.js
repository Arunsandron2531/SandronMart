const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`SANDRONMART running at http://localhost:${PORT}`);
  const url = `http://localhost:${PORT}`;
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