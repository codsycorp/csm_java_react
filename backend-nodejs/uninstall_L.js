var Service = require('node-service-linux').Service;

// Create a new service object
var svc = new Service({
  name:'la_server',
  description: 'LA NODEJS SERVER PORT 80',
  script: require('path').join(__dirname,'la_server.js')
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('uninstall',function(){
  console.log('Uninstall complete.');
  console.log('The service exists: ',svc.exists);
});

// Uninstall the service.
svc.uninstall();