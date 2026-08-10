#!/usr/bin/env node

process.stderr.write(
  "The OAuth/API-executable canary was retired. Use npm run build:token-canary for the approved Pages bearer-token backend.\n"
);
process.exitCode = 1;
