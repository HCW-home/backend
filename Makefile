
.DEFAULT_GOAL := build
COMPONENT := backend

.PHONY: install build archive test clean do-release

node_modules:
	@ npx yarn install

build: node_modules

install: build

docker:
	docker build . -t docker.io/iabsis/hcw-backend

podman:
	podman build . -t docker.io/iabsis/hcw-backend
	V=$$(cat .version) ; podman tag docker.io/iabsis/hcw-backend:latest docker.io/iabsis/hcw-backend:$$V

clean:
	@ echo "cleaning the dist directory"
	@ rm -rf node_modules

do-release:
	# Update Debian changelog
	@ gbp dch  --ignore-branch
	@ sed -i 's/UNRELEASED/focal/' debian/changelog
	@ V=$$(cat .version) ; sed -i "s/Version:.*/Version: $$V/" redhat/hcw-athome-backend.spec
	git add debian/changelog redhat/hcw-athome-backend.spec
	@ V=$$(cat .version) ;  echo "You can run now:\n git commit -m \"New release $$V\""

