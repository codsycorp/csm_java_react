#!/bin/bash
  
jar=fidovn-crm-api-

jarCount=`ls $jar*.jar | wc -l`
if [ $jarCount -gt 1 ]
then
echo "there has $jarCount $jar jar packages"
for f in `ls $jar*.jar`
do
    echo $f
done
echo "please remove or delete unnecessary jar package(s)"
exit
fi

jarName=`ls $jar*.jar | awk '{print $0}'`
echo $jarName;

pid=`ps -ef | grep java | grep $jar | grep -v grep | awk '{print $2}'`
echo 'old pid:'$pid
if [ -n "$pid" ]
then
    kill -9 $pid
    echo "stop $jar success!"
fi

nohup java -Dloader.path="/opt/webapps/fidovn/admin/lib/" -jar $jarName --spring.profiles.active=test --server.port=15300 >> console.log 2>&1 &

sleep 1

pid=`ps -ef | grep java | grep $jar | awk '{print $2}'`
echo 'new pid:'$pid
if [ -n "$pid" ]
then
    echo "start $jarName success!"
fi
