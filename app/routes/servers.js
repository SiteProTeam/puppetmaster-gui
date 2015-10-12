var express = require('express');
var router = express.Router();
var ping = require('net-ping');
var dns = require('dns');
var ssh  = require('simple-ssh');
var fs = require('fs');
var execSync = require('execSync');

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

/* GET users listing. */
router.get('/new', function(req, res, next) {
  database.query("SELECT * FROM ssh_keys", function(err, rows, field){
    if(err)
      throw err;
      res.render('servers/new', { keys: rows });
  })
});

router.post('/new', function(req, res) {
  var serverHostname = req.body.serverHostname;
  var serverUsername = req.body.serverUsername;
  var serverPassword = req.body.serverPassword;
  var serverKey = "";
  var serverKeyId = req.body.serverKey;
  var serverRole = req.body.serverRole;

  res.setHeader('Content-Type', 'application/json');
	res.status(500);

  // Verify that server is pingable
  if(!ValidateIPaddress(serverHostname))
  {
    dns.resolve(serverHostname, 'A', function(err, addresses){
        if(err){
          io.emit('server', { consoleData: "Dns resolve error: " + err });
          return;
        }
        var session = ping.createSession();
        session.pingHost(addresses[0], function (error, target) {
            if(error)
              io.emit('server', { consoleData: "Could not ping server: " + error });
        });
    });
  }
  else {
    var session = ping.createSession();
    session.pingHost(serverHostname, function (error, target) {
        if(error)
          res.send(JSON.stringify({error: 'noaccess'}));
    });
  }
console.log(serverKeyId);
  if(serverKeyId != null && serverKeyId != "" && typeof(serverKeyId) != 'undefined'){
    database.query("SELECT * FROM ssh_keys WHERE id = '" + serverKeyId + "'", function(err, rows, field){
      serverKey = rows[0].content;
      initiateConnection();
    });
  }else {
    initiateConnection();
  }

  function initiateConnection()
  {
    // Verify that ssh works
  	var sshSession = new ssh({
  		host: serverHostname,
  		user: serverUsername,
      key: serverKey,
  		timeout: 5000
  	});

    scpKey = "";
    if(serverKey != "")
      scpKey = "-i " + serverKey

    scpPassword = ""
    if(serverPassword != "")
      scpPassword = "-p " + serverPassword

  	sshSession.on('error', function(err) {
      sshSession.end();
      io.emit('server', { consoleData: "Error communicating with the server: " + err });
  	});

    progress = 25;
  	sshSession.exec("lsb_release -a 2> /dev/null | grep Distributor | cut -d ':' -f 2 | tr -d '[[:space:]]'", {
  		out: function(stdout){
  			if(stdout != 'Ubuntu')
  			{
  				  io.emit('server', { consoleData: "The server has an unsupported Operating System!" });
  				return;
  			}
  			else
  			{
          io.emit('server', { status: 'Bootstrapping', progress: '10%' });
        }
      }
    })
		.exec("wget --no-check-certificate https://raw.github.com/atomia/puppet-atomia/master/files/bootstrap_linux.sh && chmod +x bootstrap_linux.sh", {
          out: function(stdout){
            console.log(stdout);
            io.emit('server', { status: 'Downloading bootstrap file', progress: '25%' });
          }
    })
    .exec('sudo ./bootstrap_linux.sh vagrant-ubuntu-trusty-64.routerc623c2.com', {
      out: function(stdout){
        console.log(stdout);
        io.emit('server', { consoleData: stdout });
          progress = progress + 1;
          if(progress > 95)
            progress = 95;
            io.emit('server', { status: 'Runnng bootstrap script', progress: progress + "%" });
        },
      })
      .exec('sudo service puppet stop && sudo puppet agent --test && sudo service puppet start', {
        out: function(stdout){
          console.log(stdout);
          io.emit('server', { consoleData: stdout });
            progress = progress + 1;
            if(progress > 95)
              progress = 95;
              io.emit('server', { status: 'Runnng bootstrap script', progress: progress + "%" });
        },
        exit: function(code) {
          console.log("CODE " + code);
          if(code != 0)
          {
            io.emit('server', { done: 'error' });
            return;
          }
          signed = execSync.exec("puppet cert sign " + serverHostname);
          console.log(signed);
          io.emit('server', { consoleData: "Adding server to local database" });
          database.query("INSERT INTO servers VALUES(null,'" + serverHostname + "','" + serverUsername + "','" + serverPassword + "','" + serverKeyId + "')", function(err, rows, field) {
            if(err)
            {
              io.emit('server', { consoleData: "Error adding server to the database: " + err });
              io.emit('server', { done: 'error' });
            }
              console.log(rows);
              if(serverRole != "" && typeof serverRole != 'undefined')
              {
                serverId = rows["insertId"];
                database.query("INSERT INTO roles VALUES(null,'" + serverRole + "','" + serverId + "')", function(err, rows, field) {
                  if(err)
                  {
                    io.emit('server', { consoleData: "Error adding server role to the database: " + err });
                    io.emit('server', { done: 'error' });
                  }
                  return;
                });
              }
              io.emit('server', { done: 'ok' });
              return;
          });
          io.emit('server', { done: 'ok' });
          return;
        }
    }).start();

  }
  	res.status(200);
    res.send(JSON.stringify({ok: "ok"}));

});

function ValidateIPaddress(ipaddress)
{
 if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipaddress))
  {
    return (true)
  }
return (false)
}

module.exports = router;