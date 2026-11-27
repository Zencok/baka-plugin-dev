#!/usr/bin/env node
'use strict';
// This loads/executes trusted authoring source. node:vm is not a sandbox.
require('../assets/authoring/check.cjs').main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
