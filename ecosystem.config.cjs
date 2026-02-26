module.exports = {
  apps : [{
    name: 'clawshopping',
    script: "pnpm",
    args: "start -p 3000 -H 0.0.0.0",
    watch: '.',
    cwd: '.',
  }],
};

