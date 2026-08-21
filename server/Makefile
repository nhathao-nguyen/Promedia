BINARY_NAME ?= promedia-server
BUILD_DIR ?= bin
TARGET_ARCH ?= amd64

.PHONY: run build-linux build-windows test verify fmt tidy

run:
	go run ./cmd/server

build-linux:
	@mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=$(TARGET_ARCH) go build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-$(TARGET_ARCH) ./cmd/server

build-windows:
	@mkdir -p $(BUILD_DIR)
	GOOS=windows GOARCH=$(TARGET_ARCH) go build -o $(BUILD_DIR)/$(BINARY_NAME)-windows-$(TARGET_ARCH).exe ./cmd/server

test:
	go test ./...

verify: test

fmt:
	go fmt ./...

tidy:
	go mod tidy
