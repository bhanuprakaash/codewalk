.PHONY: check format build install

GOFILES = $(shell find . -name '*.go' -not -path './web/node_modules/*')

check: web/node_modules
	@files=$$(gofmt -l $(GOFILES)); [ -z "$$files" ] || { echo "not gofmt-ed: $$files"; exit 1; }
	go vet ./...
	go test ./...
	pnpm -C web exec tsc --noEmit
	pnpm -C web exec prettier --check .

format: web/node_modules
	gofmt -w $(GOFILES)
	pnpm -C web exec prettier --write .

build: web/node_modules
	pnpm -C web build
	go build -o codewalk ./cmd/codewalk

install: web/node_modules
	pnpm -C web build
	go install ./cmd/codewalk
	@launchctl print gui/$$(id -u)/com.codewalk >/dev/null 2>&1 && launchctl kickstart -k gui/$$(id -u)/com.codewalk || true

web/node_modules: web/package.json web/pnpm-lock.yaml
	pnpm -C web install --frozen-lockfile
	@touch $@
