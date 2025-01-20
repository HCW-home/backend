#!/bin/bash

## This script combine the language files
# simply create a file <lang>.override.json and the overrided language
# will be applied on upgrade.

folder=$(dirname $0)

for file in ${folder}/??.json ; do
  basename=$(echo ${file/.json/})
  filename=$(basename ${file})
  lang=${filename/.json/}
  if [ -f ${basename}.override.json ] ; then
    jq -s '.[0] * .[1]' ${basename}.json ${basename}.override.json > ${basename}.combined.json ; ret=$?
    if [ ${ret} = 0 ] ; then
      mv ${basename}.json ${basename}.orig.json
      mv ${basename}.combined.json ${basename}.json
      echo "Lang ${lang} combined successfully"
    else
      echo "Error during combining lang ${lang}, check if json is valid"
    fi
  else
    echo "Nothing to combine for lang ${lang}"
  fi
done
