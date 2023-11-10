VERSION ?= $(shell head -n 1 debian/changelog| cut -d' ' -f2 | sed 's/[\(\)]*//g')

.DEFAULT_GOAL := build

.PHONY: install build archive test clean do-release

node_modules:
	@ npx yarn install

build: node_modules

install: build

docker:
	docker build . -t docker.io/iabsis/hcw-backend

podman:
	podman build . -t docker.io/iabsis/hcw-backend

clean:
	@ echo "cleaning the dist directory"
	@ rm -rf node_modules

do-release:
	gbp dch  --ignore-branch
	sed -i 's/UNRELEASED/focal/' debian/changelog
	sed -i "s/Version:.*/Version: $(VERSION)/" redhat/hcw-athome-backend.spec
	git add debian/changelog redhat/hcw-athome-backend.spec
	echo "You can run now:\n git commit -m \"New release ${VERSION}\""

INFO := @bash -c '\
  printf $(YELLOW); \
  echo "=> $$1"; \
printf $(NC)' SOME_VALUE
