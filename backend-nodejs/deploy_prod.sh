#!/bin/bash

jar=fidovn-crm-api-1.0.0.jar

ip=172.26.87.33
passwd=X0TN9x1bSFquEGiQy7mfmhzIEoHSBY1w
dstPath=/opt/webapps/fidovn/crm/bin

echo scp $jar to product enviroment
sshpass -p $passwd scp $jar aaron@$ip:$dstPath

sshpass -p $passwd ssh honor@$ip "cd $dstPath && ./start.sh"
