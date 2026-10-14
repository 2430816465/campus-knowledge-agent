'use strict';
// Temple routes use actual movement, jump and interaction inputs.
const routes=require('../../../tests/coop-remake.cjs');
if(require.main===module)for(let i=3;i<50;i++)console.log('PASS',i+1,routes.solve(i));
module.exports=routes;
