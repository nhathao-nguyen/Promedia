package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

const (
	defaultEnvironmentFile = ".env"
	environmentFileKey     = "PROMEDIA_ENV_FILE"
)

type Config struct {
	HTTPAddr           string
	CORSAllowedOrigins []string
	HTTPReadTimeout    time.Duration
	HTTPWriteTimeout   time.Duration
	HTTPIdleTimeout    time.Duration
	ShutdownTimeout    time.Duration
}

type lookupFunc func(string) (string, bool)

func Load() (Config, error) {
	fileValues, err := readEnvironmentFile()
	if err != nil {
		return Config{}, err
	}

	lookup := func(key string) (string, bool) {
		if value, ok := os.LookupEnv(key); ok {
			value = strings.TrimSpace(value)
			if value != "" {
				return value, true
			}
		}

		value, ok := fileValues[key]
		value = strings.TrimSpace(value)
		return value, ok && value != ""
	}

	return load(lookup)
}

func readEnvironmentFile() (map[string]string, error) {
	path, explicitlyConfigured := os.LookupEnv(environmentFileKey)
	path = strings.TrimSpace(path)
	if path == "" {
		path = defaultEnvironmentFile
		explicitlyConfigured = false
	}

	values, err := godotenv.Read(path)
	if err == nil {
		return values, nil
	}
	if errors.Is(err, os.ErrNotExist) && !explicitlyConfigured {
		return map[string]string{}, nil
	}

	return nil, fmt.Errorf("read configuration file %q: %w", path, err)
}

func load(lookup lookupFunc) (Config, error) {
	httpAddr, err := required(lookup, "HTTP_ADDR")
	if err != nil {
		return Config{}, err
	}

	corsAllowedOrigins, err := allowedOrigins(lookup)
	if err != nil {
		return Config{}, err
	}

	readTimeout, err := duration(lookup, "HTTP_READ_TIMEOUT")
	if err != nil {
		return Config{}, err
	}

	writeTimeout, err := duration(lookup, "HTTP_WRITE_TIMEOUT")
	if err != nil {
		return Config{}, err
	}

	idleTimeout, err := duration(lookup, "HTTP_IDLE_TIMEOUT")
	if err != nil {
		return Config{}, err
	}

	shutdownTimeout, err := duration(lookup, "SHUTDOWN_TIMEOUT")
	if err != nil {
		return Config{}, err
	}

	return Config{
		HTTPAddr:           httpAddr,
		CORSAllowedOrigins: corsAllowedOrigins,
		HTTPReadTimeout:    readTimeout,
		HTTPWriteTimeout:   writeTimeout,
		HTTPIdleTimeout:    idleTimeout,
		ShutdownTimeout:    shutdownTimeout,
	}, nil
}

func allowedOrigins(lookup lookupFunc) ([]string, error) {
	const key = "CORS_ALLOWED_ORIGINS"

	value, err := required(lookup, key)
	if err != nil {
		return nil, err
	}

	origins := make([]string, 0)
	seen := make(map[string]struct{})
	for _, candidate := range strings.Split(value, ",") {
		origin, err := normalizeOrigin(strings.TrimSpace(candidate))
		if err != nil {
			return nil, fmt.Errorf("%s contains an invalid origin %q: %w", key, candidate, err)
		}
		if _, exists := seen[origin]; exists {
			continue
		}

		seen[origin] = struct{}{}
		origins = append(origins, origin)
	}

	if len(origins) == 0 {
		return nil, fmt.Errorf("%s must contain at least one origin", key)
	}

	return origins, nil
}

func normalizeOrigin(value string) (string, error) {
	if value == "" {
		return "", errors.New("origin is empty")
	}
	if value == "*" {
		return "", errors.New("wildcard is not allowed")
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return "", err
	}
	if (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return "", errors.New("origin must use HTTP or HTTPS and include a host")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return "", errors.New("origin must not include credentials, path, query, or fragment")
	}

	return strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host), nil
}

func required(lookup lookupFunc, key string) (string, error) {
	value, ok := lookup(key)
	if !ok {
		return "", fmt.Errorf("%s is required", key)
	}
	return value, nil
}

func duration(lookup lookupFunc, key string) (time.Duration, error) {
	value, err := required(lookup, key)
	if err != nil {
		return 0, err
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be a valid duration: %w", key, err)
	}
	if parsed <= 0 {
		return 0, fmt.Errorf("%s must be greater than zero", key)
	}
	return parsed, nil
}
