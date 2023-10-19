#!/bin/bash

gbp dch  --ignore-branch
sed -i 's/UNRELEASED/focal/' debian/changelog
version=$1
if [-z $version]
    version=$(head -n 1 debian/changelog| cut -d' ' -f2 | sed 's/[\(\)]*//g')
fi
sed -i "s/Version:.*/Version: ${version}/" redhat/hcw-athome-backend.spec
git add debian/changelog redhat/hcw-athome-backend.spec
echo "Do: git commit -m \"New release ${version}\""
